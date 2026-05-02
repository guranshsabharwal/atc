import {
    WorldState,
    Command,
    SpawnAircraftCommand,
    IssueTaxiClearanceCommand,
    TakeoffClearanceCommand,
    LandingClearanceCommand,
    DeleteAircraftCommand,
    LineUpAndWaitCommand,
    VectorCommand,
    DirectToCommand,
    AltitudeCommand,
    SpeedCommand,
    HandoffCommand,
    SetModeCommand,
    AssignRunwayCommand,
    HoldAircraftCommand,
    Aircraft,
    Metrics,
    OperatingMode,
    RunwayConfig,
    KHEF_GATES,
    KHEF_DEMO_SCENARIO,
    KHEF_RUNWAY_CONFIGS,
    ScenarioAircraft,
} from '@atc/shared';
import { GraphManager, GroundGraph } from './GraphManager';
import { RunwayManager } from './RunwayManager';
import { AirNavigationManager } from './AirNavigationManager';

// "Action" distance: when the trailing aircraft starts holding to avoid a
// conflict. Larger than NEAR_MISS_METERS so the discrete-tick simulation never
// actually lets two aircraft get within the spec'd 50 m minimum separation.
const ACTION_METERS = 75;
// "Near-miss" distance: this is the actual safety threshold counted in metrics.
const NEAR_MISS_METERS = 50;
// Snap-block distance: if another aircraft is already this close to the next
// graph node, the trailing aircraft won't snap onto it (real queue formation).
const NODE_OCCUPIED_METERS = 30;
// Demo cadence: real ATC uses ~60–120 s between same-runway departures, but
// for a science fair demo 30 s keeps the run snappy without looking unsafe.
const MIN_SEPARATION_SECONDS = 30;
// Patient stop-and-wait window: how long an AI aircraft holds in a near-miss
// before attempting a reroute. Real ATC behavior: stop, let the leader pass,
// then either resume or be redirected. With dispatch throttling below, this
// rarely fires.
const PATIENT_HOLD_MS = 8000;
// AI dispatch throttle: minimum gap between successive TAXI clearances heading
// to the SAME runway. At ~30 m/s taxi speed, 4 s gives ~120 m of spacing along
// the route, well above the 75 m action distance — aircraft form a natural
// queue without piling up. Low enough to keep total run time competitive.
const TAXI_DISPATCH_GAP_MS = 4000;

interface PendingSpawn {
    scenario: ScenarioAircraft;
    spawnAtMs: number;
}

export class Simulation {
    private state: WorldState;
    private graph: GraphManager;
    private runwayManager: RunwayManager;
    private airNav: AirNavigationManager;
    private lastDeparture: Map<string, number> = new Map();    // runwayId -> ms timestamp
    private lastTaxiDispatch: Map<string, number> = new Map(); // runwayId -> ms timestamp of last TAXI release (AI mode queue)
    private pendingSpawns: PendingSpawn[] = [];
    private nearMissPairs: Set<string> = new Set();            // canonical "id1|id2" already counted
    private aiActionCooldown: Map<string, number> = new Map(); // aircraftId -> earliest next-action ms

    constructor(graphData: GroundGraph) {
        this.graph = new GraphManager(graphData);
        this.runwayManager = new RunwayManager();
        this.airNav = new AirNavigationManager();
        this.state = {
            aircraft: [],
            runways: [],
            timestamp: Date.now(),
            mode: 'AI',
            metrics: this.makeEmptyMetrics(),
            scenarioRunning: false,
            activeConfig: '16',
        };
    }

    /** Build the avoid-set for taxi pathfinding: every OCCUPIED runway's centerline,
     *  except the destination runway's reciprocal pair (which contains the threshold
     *  area near the hold-short). */
    private taxiAvoidSet(destinationRunway?: string): Set<string> {
        const avoid = new Set<string>();
        const reciprocals: Record<string, string> = {
            '16L': '34R', '34R': '16L', '16R': '34L', '34L': '16R',
        };
        for (const rwy of this.runwayManager.getAllRunways()) {
            if (rwy.status !== 'OCCUPIED') continue;
            if (rwy.id === destinationRunway) continue;
            if (reciprocals[rwy.id] === destinationRunway) continue;
            for (const n of this.graph.getRunwayCenterlineNodes(rwy.id)) avoid.add(n);
        }
        return avoid;
    }

    private makeEmptyMetrics(): Metrics {
        return {
            startedAt: null,
            completedAt: null,
            spawned: 0,
            departed: 0,
            nearMisses: 0,
            totalTaxiSeconds: 0,
        };
    }

    public getState(): WorldState {
        this.state.runways = this.runwayManager.getAllRunways();
        return this.state;
    }

    public handleCommand(cmd: Command) {
        if (cmd.type === 'spawnAircraft') {
            this.spawnAircraft(cmd as SpawnAircraftCommand);
        } else if (cmd.type === 'issueTaxiClearance') {
            this.issueTaxiClearance(cmd as IssueTaxiClearanceCommand);
        } else if (cmd.type === 'takeoffClearance') {
            this.handleTakeoffClearance(cmd as TakeoffClearanceCommand);
        } else if (cmd.type === 'landingClearance') {
            this.handleLandingClearance(cmd as LandingClearanceCommand);
        } else if (cmd.type === 'deleteAircraft') {
            this.deleteAircraft(cmd as DeleteAircraftCommand);
        } else if (cmd.type === 'lineUpAndWait') {
            this.handleLineUpAndWait(cmd as LineUpAndWaitCommand);
        } else if (cmd.type === 'vector') {
            this.handleVector(cmd as VectorCommand);
        } else if (cmd.type === 'directTo') {
            this.handleDirectTo(cmd as DirectToCommand);
        } else if (cmd.type === 'altitude') {
            this.handleAltitude(cmd as AltitudeCommand);
        } else if (cmd.type === 'speed') {
            this.handleSpeed(cmd as SpeedCommand);
        } else if (cmd.type === 'handoff') {
            this.handleHandoff(cmd as HandoffCommand);
        } else if (cmd.type === 'setMode') {
            this.handleSetMode(cmd as SetModeCommand);
        } else if (cmd.type === 'startScenario') {
            this.handleStartScenario();
        } else if (cmd.type === 'resetScenario') {
            this.handleResetScenario();
        } else if (cmd.type === 'assignRunway') {
            this.handleAssignRunway(cmd as AssignRunwayCommand);
        } else if (cmd.type === 'holdAircraft') {
            this.handleHoldAircraft(cmd as HoldAircraftCommand);
        }
    }

    private handleHoldAircraft(cmd: HoldAircraftCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) return;
        ac.manualHold = cmd.payload.hold;
        if (cmd.payload.hold) ac.speed = 0;
    }

    private handleSetMode(cmd: SetModeCommand) {
        this.state.mode = cmd.payload.mode;
        console.log(`[Sim] Mode set to ${cmd.payload.mode}`);
    }

    private handleStartScenario() {
        if (this.state.scenarioRunning) {
            console.warn(`[Sim] Scenario already running; ignoring startScenario`);
            return;
        }
        const now = Date.now();
        this.state.scenarioRunning = true;
        this.state.activeConfig = '16'; // demo always runs in south-flow
        this.state.metrics = {
            ...this.makeEmptyMetrics(),
            startedAt: now,
        };
        this.pendingSpawns = KHEF_DEMO_SCENARIO.map(s => ({
            scenario: s,
            spawnAtMs: now + s.spawnDelaySec * 1000,
        }));
        console.log(`[Sim] Scenario started: ${this.pendingSpawns.length} aircraft, mode=${this.state.mode}, config=${this.state.activeConfig}`);
    }

    private handleResetScenario() {
        this.state.aircraft = [];
        this.state.alerts = [];
        this.state.metrics = this.makeEmptyMetrics();
        this.state.scenarioRunning = false;
        this.state.activeConfig = '16';
        this.pendingSpawns = [];
        this.nearMissPairs.clear();
        this.lastDeparture.clear();
        this.lastTaxiDispatch.clear();
        this.aiActionCooldown.clear();
        // Release every runway so the next run starts FREE.
        for (const rwy of this.runwayManager.getAllRunways()) {
            this.runwayManager.releaseRunway(rwy.id);
        }
        console.log(`[Sim] Scenario reset`);
    }

    private handleAssignRunway(cmd: AssignRunwayCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) return;
        const config = this.state.activeConfig ?? '16';
        const activeSet = KHEF_RUNWAY_CONFIGS[config].active;
        if (!activeSet.includes(cmd.payload.runwayId)) {
            console.warn(`[Sim] Runway ${cmd.payload.runwayId} not active (config ${config}); ignoring assignment`);
            return;
        }
        ac.assignedRunwayId = cmd.payload.runwayId;
        // Trigger taxi immediately so the operator only clicks once per aircraft.
        if (ac.clearance?.type === 'NONE' || !ac.clearance) {
            this.issueTaxiClearance({
                type: 'issueTaxiClearance',
                payload: { aircraftId: ac.id, destinationRunwayId: cmd.payload.runwayId },
            });
        }
    }

    public tick(dt: number) {
        this.state.timestamp = Date.now();
        const now = this.state.timestamp;

        // 1. Spawn any scheduled scenario aircraft whose time has come.
        if (this.state.scenarioRunning && this.pendingSpawns.length > 0) {
            const remaining: PendingSpawn[] = [];
            for (const ps of this.pendingSpawns) {
                if (now >= ps.spawnAtMs) {
                    this.spawnFromScenario(ps.scenario);
                } else {
                    remaining.push(ps);
                }
            }
            this.pendingSpawns = remaining;
        }

        // 2. Update physics for each aircraft. detectNearMisses tags conflicts/halts.
        this.detectNearMisses();
        const updated = this.state.aircraft.map(ac => this.updatePhysics(ac, dt));

        // 3. Detect departures (TAKEOFF -> airborne) and credit metrics exactly once.
        for (const ac of updated) {
            if (ac.clearance?.type === 'DEPARTED' && this.state.metrics) {
                this.state.metrics.departed += 1;
            }
        }
        this.state.aircraft = updated.filter(ac => ac.clearance?.type !== 'DEPARTED');

        // 4. Accumulate taxi-time metric while aircraft are physically moving on the ground.
        if (this.state.metrics) {
            for (const ac of this.state.aircraft) {
                const onGround = !ac.flightPhase || ac.flightPhase === 'GROUND';
                if (onGround && ac.speed > 0) {
                    ac.taxiSeconds = (ac.taxiSeconds ?? 0) + dt;
                    this.state.metrics.totalTaxiSeconds += dt;
                }
            }
        }

        // 5. AI auto-pilot loop (issues taxi/lineup/takeoff for AI mode aircraft).
        if (this.state.mode === 'AI' && this.state.scenarioRunning) {
            this.runAiAutopilot();
        } else if (this.state.mode === 'HUMAN' && this.state.scenarioRunning) {
            // Even in HUMAN mode we auto-fire line-up + takeoff once the operator's
            // hand-picked taxi clearance has reached HOLD. This matches the
            // "click once to assign runway" UX from the plan.
            this.runHumanAutoSequencing();
        }

        // 6. Scenario-complete detection: all aircraft spawned and none on the field.
        if (
            this.state.scenarioRunning &&
            this.pendingSpawns.length === 0 &&
            this.state.aircraft.length === 0 &&
            this.state.metrics &&
            this.state.metrics.spawned > 0 &&
            this.state.metrics.completedAt === null
        ) {
            this.state.metrics.completedAt = now;
            console.log(`[Sim] Scenario complete in ${(now - (this.state.metrics.startedAt ?? now)) / 1000}s`);
        }

        // 7. Runway incursions (existing behavior).
        const alerts = this.runwayManager.checkForIncursions(this.state.aircraft);
        if (alerts.length > 0) {
            console.warn(`[Sim] Incursions Detected: ${alerts.join(', ')}`);
        }
        this.state.alerts = alerts;
    }

    /**
     * Detect 50 m proximity events between every taxiing-aircraft pair. In HUMAN
     * mode the trailing aircraft is halted (creating the visible jam); in AI mode
     * the lower-priority aircraft is rerouted via findPathAvoiding.
     *
     * Aircraft under LINEUP/TAKEOFF/LAND clearance are excluded — they're on the
     * runway and shouldn't be halted by something at the hold-short.
     */
    private detectNearMisses() {
        const SPAWN_GRACE_MS = 5000; // ignore near-misses for first 5 s after spawn
        const now = this.state.timestamp;
        const taxiOnly = (a: Aircraft) => {
            if (a.flightPhase && a.flightPhase !== 'GROUND') return false;
            const t = a.clearance?.type;
            return t !== 'TAKEOFF' && t !== 'LINEUP' && t !== 'LAND';
        };
        const justSpawned = (a: Aircraft) =>
            a.spawnedAt !== undefined && (now - a.spawnedAt) < SPAWN_GRACE_MS;
        const ground = this.state.aircraft.filter(taxiOnly);
        // Reset transient flags every tick for EVERY aircraft (not just ground), so
        // an inConflictStop flag from a previous TAXI conflict doesn't carry over
        // into a later LINEUP/TAKEOFF state. conflictHeldSince is preserved here
        // and cleared below for aircraft no longer paired in a conflict.
        const wasInConflict = new Set<string>();
        for (const ac of this.state.aircraft) {
            ac.inConflictStop = false;
            ac.isRerouting = false;
        }

        for (let i = 0; i < ground.length; i++) {
            for (let j = i + 1; j < ground.length; j++) {
                const a = ground[i];
                const b = ground[j];
                const distM = this.graph.haversineMeters(a.position.lat, a.position.lon, b.position.lat, b.position.lon);
                if (distM > ACTION_METERS) continue;
                if (justSpawned(a) || justSpawned(b)) continue; // grace period

                // Only count near-miss for the actual safety threshold (50 m). The
                // halt action fires earlier (75 m) so we never breach 50 m in steady state.
                if (distM <= NEAR_MISS_METERS) {
                    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
                    if (!this.nearMissPairs.has(key)) {
                        this.nearMissPairs.add(key);
                        if (this.state.metrics) this.state.metrics.nearMisses += 1;
                        console.log(`[Sim] Near-miss: ${a.callsign} vs ${b.callsign} at ${distM.toFixed(1)}m`);
                    }
                }

                // Pick lower-priority aircraft (further from its hold-short target wins less priority).
                const trailing = this.lowerPriority(a, b);
                const leader = trailing === a ? b : a;

                // Always halt first (real ATC: stop, wait for the other plane).
                trailing.speed = 0;
                trailing.inConflictStop = true;
                wasInConflict.add(trailing.id);
                if (trailing.conflictHeldSince === undefined) {
                    trailing.conflictHeldSince = now;
                }

                // AI: if the conflict has been ongoing for PATIENT_HOLD_MS, attempt a
                // reroute around the leader (and any other active runway).
                if (this.state.mode === 'AI') {
                    const heldFor = now - (trailing.conflictHeldSince ?? now);
                    if (heldFor >= PATIENT_HOLD_MS) {
                        if (this.tryReroute(trailing, leader)) {
                            trailing.isRerouting = true;
                            trailing.inConflictStop = false;
                            trailing.conflictHeldSince = undefined;
                        }
                    }
                }
            }
        }

        // Aircraft that are no longer halted by a conflict get their hold-since
        // timer cleared, so the next conflict starts fresh from the patient window.
        for (const ac of ground) {
            if (!wasInConflict.has(ac.id)) {
                ac.conflictHeldSince = undefined;
            }
        }

        // Allow pair to re-fire if aircraft separate and re-converge later.
        const liveIds = new Set(ground.map(a => a.id));
        for (const key of Array.from(this.nearMissPairs)) {
            const [id1, id2] = key.split('|');
            if (!liveIds.has(id1) || !liveIds.has(id2)) {
                this.nearMissPairs.delete(key);
                continue;
            }
            const a = ground.find(g => g.id === id1)!;
            const b = ground.find(g => g.id === id2)!;
            const distM = this.graph.haversineMeters(a.position.lat, a.position.lon, b.position.lat, b.position.lon);
            if (distM > NEAR_MISS_METERS * 2) {
                this.nearMissPairs.delete(key);
            }
        }
    }

    /**
     * Pick which aircraft of a near-miss pair is "trailing" (gets halted/rerouted).
     * Order of preference for halting (lowest priority first):
     *   1. The one without a real clearance (just spawned, hasn't started its journey).
     *   2. The less-progressed one (smaller targetIndex along its route).
     *   3. Tie-break by aircraft id.
     */
    private lowerPriority(a: Aircraft, b: Aircraft): Aircraft {
        const aHasClearance = !!a.clearance && a.clearance.type !== 'NONE';
        const bHasClearance = !!b.clearance && b.clearance.type !== 'NONE';
        if (aHasClearance && !bHasClearance) return b;
        if (!aHasClearance && bHasClearance) return a;
        const ai = a.targetIndex ?? 0;
        const bi = b.targetIndex ?? 0;
        if (ai !== bi) return ai < bi ? a : b;
        return a.id < b.id ? a : b;
    }

    private tryReroute(trailing: Aircraft, leader: Aircraft): boolean {
        if (!trailing.route || trailing.route.length === 0) return false;
        if (trailing.clearance?.type !== 'TAXI') return false; // Don't reroute LINEUP/TAKEOFF.

        // Don't reroute around an aircraft that is HOLDING or LINING UP — that
        // aircraft is actively queued for takeoff and will be gone in seconds.
        // Sending the trailing plane on a long detour would be wasteful.
        const leaderType = leader.clearance?.type;
        if (leaderType === 'HOLD' || leaderType === 'LINEUP') return false;

        // Avoid the leader's next ~3 nodes plus its current nearest node, AND
        // any active runway centerlines (we never cross a runway in use).
        const avoid = this.taxiAvoidSet(trailing.assignedRunwayId);
        const leaderNearest = this.graph.findNearestNode(leader.position.lat, leader.position.lon);
        if (leaderNearest) avoid.add(leaderNearest);
        if (leader.route) {
            const idx = leader.targetIndex ?? 0;
            for (let k = idx; k < Math.min(idx + 3, leader.route.length); k++) {
                avoid.add(leader.route[k]);
            }
        }

        const startId = this.graph.findNearestNode(trailing.position.lat, trailing.position.lon);
        const endId = trailing.route[trailing.route.length - 1];
        if (!startId || !endId) return false;

        const newPath = this.graph.findPathAvoiding(startId, endId, avoid, { allowRunways: false });
        if (!newPath || newPath.length < 2) return false;

        // Sanity-check: rerouted path must materially differ from the avoid set.
        const overlapsAvoid = newPath.slice(0, 3).some(n => avoid.has(n));
        if (overlapsAvoid) return false;

        // Reject cross-airport detours: if the new path is more than ~1.5x the
        // remaining original path, just wait instead of taking the long way.
        const originalRemaining = trailing.route.length - (trailing.targetIndex ?? 0);
        if (newPath.length > originalRemaining * 1.5 + 5) return false;

        const holdShort = trailing.clearance.type === 'TAXI' ? trailing.clearance.holdShort : undefined;
        trailing.route = newPath;
        trailing.targetIndex = 0;
        trailing.clearance = { type: 'TAXI', route: newPath, holdShort };
        if (trailing.speed === 0) trailing.speed = 60;
        return true;
    }

    private runAiAutopilot() {
        // Build per-runway pending-taxi groups so we can dispatch ONE aircraft at
        // a time per runway, in shortest-distance-to-runway order, with at least
        // TAXI_DISPATCH_GAP_MS between dispatches. This is the simple queue real
        // ground control uses — aircraft taxi serially with safe spacing, no
        // reactive collision avoidance needed.
        const pendingByRunway = new Map<string, Aircraft[]>();
        for (const ac of this.state.aircraft) {
            if (ac.flightPhase && ac.flightPhase !== 'GROUND') continue;
            const c = ac.clearance?.type;
            if (c && c !== 'NONE') continue;
            const runway = ac.assignedRunwayId ?? ac.suggestedRunwayId;
            if (!runway) continue;
            if (!pendingByRunway.has(runway)) pendingByRunway.set(runway, []);
            pendingByRunway.get(runway)!.push(ac);
        }

        // For each runway, dispatch the closest pending aircraft if the per-runway
        // gap has elapsed. Closest-to-hold-short wins (shortest taxi first).
        pendingByRunway.forEach((pending, runway) => {
            const lastDispatch = this.lastTaxiDispatch.get(runway) ?? 0;
            if (this.state.timestamp - lastDispatch < TAXI_DISPATCH_GAP_MS && lastDispatch > 0) return;
            const holdShortNode = this.graph.getHoldShortNodeForRunway(runway);
            const holdShortPos = holdShortNode ? this.graph.getNode(holdShortNode) : null;
            pending.sort((a, b) => {
                if (!holdShortPos) return 0;
                const da = this.graph.haversineMeters(a.position.lat, a.position.lon, holdShortPos.lat, holdShortPos.lon);
                const db = this.graph.haversineMeters(b.position.lat, b.position.lon, holdShortPos.lat, holdShortPos.lon);
                return da - db;
            });
            const next = pending[0];
            this.issueTaxiClearance({
                type: 'issueTaxiClearance',
                payload: { aircraftId: next.id, destinationRunwayId: runway },
            });
            this.lastTaxiDispatch.set(runway, this.state.timestamp);
            this.aiActionCooldown.set(next.id, this.state.timestamp + 500);
        });

        // Sequence aircraft already in the taxi/hold pipeline through line-up + takeoff.
        for (const ac of this.state.aircraft) {
            if (ac.flightPhase && ac.flightPhase !== 'GROUND') continue;
            if (ac.manualHold) continue; // operator-held: do nothing
            const cooldown = this.aiActionCooldown.get(ac.id) ?? 0;
            if (this.state.timestamp < cooldown) continue;
            const c = ac.clearance?.type;
            if (c === 'HOLD') {
                const runway = ac.assignedRunwayId ?? ac.suggestedRunwayId;
                if (!runway) continue;
                if (this.canDepartNow(runway, ac.id)) {
                    this.handleLineUpAndWait({
                        type: 'lineUpAndWait',
                        payload: { aircraftId: ac.id, runwayId: runway },
                    });
                    this.aiActionCooldown.set(ac.id, this.state.timestamp + 1500);
                }
            } else if (c === 'LINEUP') {
                const runway = (ac.clearance && 'runwayId' in ac.clearance ? ac.clearance.runwayId : undefined) ?? ac.assignedRunwayId;
                if (!runway) continue;
                if (this.canDepartNow(runway, ac.id)) {
                    this.handleTakeoffClearance({
                        type: 'takeoffClearance',
                        payload: { aircraftId: ac.id, runwayId: runway },
                    });
                    this.aiActionCooldown.set(ac.id, this.state.timestamp + 1500);
                }
            }
        }
    }

    private runHumanAutoSequencing() {
        // In HUMAN mode the operator only clicks "assign runway" once. Once the
        // aircraft reaches HOLD we auto-line-up and auto-takeoff so the demo is
        // not a clickfest — the differentiator is *which* runway the operator
        // chose and the lack of collision avoidance during taxi.
        for (const ac of this.state.aircraft) {
            if (ac.flightPhase && ac.flightPhase !== 'GROUND') continue;
            if (ac.manualHold) continue; // operator-held: do nothing
            const cooldown = this.aiActionCooldown.get(ac.id) ?? 0;
            if (this.state.timestamp < cooldown) continue;
            const c = ac.clearance?.type;
            const runway = ac.assignedRunwayId;
            if (!runway) continue;

            if (c === 'HOLD') {
                if (this.canDepartNow(runway, ac.id)) {
                    this.handleLineUpAndWait({
                        type: 'lineUpAndWait',
                        payload: { aircraftId: ac.id, runwayId: runway },
                    });
                    this.aiActionCooldown.set(ac.id, this.state.timestamp + 1500);
                }
            } else if (c === 'LINEUP') {
                if (this.canDepartNow(runway, ac.id)) {
                    this.handleTakeoffClearance({
                        type: 'takeoffClearance',
                        payload: { aircraftId: ac.id, runwayId: runway },
                    });
                    this.aiActionCooldown.set(ac.id, this.state.timestamp + 1500);
                }
            }
        }
    }

    /** Runway free for this aircraft AND min-separation timer satisfied. */
    private canDepartNow(runwayId: string, aircraftId: string): boolean {
        const rwy = this.runwayManager.getRunwayState(runwayId);
        if (rwy && rwy.occupiedBy && rwy.occupiedBy !== aircraftId) return false;
        const last = this.lastDeparture.get(runwayId) ?? 0;
        if (last > 0 && (this.state.timestamp - last) / 1000 < MIN_SEPARATION_SECONDS) return false;
        return true;
    }

    private spawnFromScenario(s: ScenarioAircraft) {
        // Reuse spawnAircraft for gate-position resolution + nearest-node lookup,
        // then tag the resulting aircraft with its scenario runway.
        this.spawnAircraft({
            type: 'spawnAircraft',
            payload: { callsign: s.callsign, gateId: s.gateId },
        });
        const ac = this.state.aircraft[this.state.aircraft.length - 1];
        if (!ac) return;
        ac.suggestedRunwayId = s.runwayId;
        ac.spawnedAt = this.state.timestamp;
        ac.taxiSeconds = 0;
        if (this.state.mode === 'AI') {
            ac.assignedRunwayId = s.runwayId;
        }
        if (this.state.metrics) this.state.metrics.spawned += 1;
    }

    private spawnAircraft(cmd: SpawnAircraftCommand) {
        let spawnPos = { lat: 0, lon: 0, alt: 0, heading: 0 };
        let startNodeId: string | null = null;

        if (cmd.payload.gateId) {
            const gate = KHEF_GATES.find(g => g.id === cmd.payload.gateId);
            if (gate) {
                spawnPos = { lat: gate.lat, lon: gate.lon, alt: 300, heading: gate.heading };
            } else {
                console.warn(`[Sim] Gate ${cmd.payload.gateId} not found, defaulting`);
            }
        } else if (cmd.payload.startPosition) {
            spawnPos = cmd.payload.startPosition;
        }

        // Avoid spawning ON TOP of another aircraft (same gate, multiple flights).
        // Nudge perpendicular to the gate heading until we have a comfortable buffer
        // beyond the action radius so the new aircraft can begin moving without
        // immediately tripping the near-miss check against a still-taxiing neighbor.
        const SPAWN_BUFFER_METERS = ACTION_METERS * 2; // 150 m
        let attempt = 0;
        while (attempt < 10) {
            const tooClose = this.state.aircraft.some(other => {
                const d = this.graph.haversineMeters(other.position.lat, other.position.lon, spawnPos.lat, spawnPos.lon);
                return d < SPAWN_BUFFER_METERS;
            });
            if (!tooClose) break;
            const perpHeadingRad = ((spawnPos.heading + 90) % 360) * Math.PI / 180;
            const offsetMeters = (attempt + 1) * SPAWN_BUFFER_METERS;
            const offsetDeg = offsetMeters / 111000;
            spawnPos = {
                ...spawnPos,
                lat: spawnPos.lat + offsetDeg * Math.cos(perpHeadingRad),
                lon: spawnPos.lon + offsetDeg * Math.sin(perpHeadingRad) / Math.cos(spawnPos.lat * Math.PI / 180),
            };
            attempt += 1;
        }

        startNodeId = this.graph.findNearestNode(spawnPos.lat, spawnPos.lon, spawnPos.heading);

        const newAircraft: Aircraft = {
            id: Math.random().toString(36).substring(7),
            callsign: cmd.payload.callsign,
            position: spawnPos,
            speed: 0,
            route: startNodeId ? [startNodeId] : [],
            targetIndex: 0,
            clearance: { type: 'NONE' }
        };

        this.state.aircraft.push(newAircraft);
        console.log(`[Sim] Spawned ${newAircraft.callsign} at ${newAircraft.position.lat}, ${newAircraft.position.lon}`);
    }

    private issueTaxiClearance(cmd: IssueTaxiClearanceCommand) {
        const aircraft = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!aircraft) {
            console.warn(`[Sim] Aircraft ${cmd.payload.aircraftId} not found`);
            return;
        }

        const runwayId = cmd.payload.destinationRunwayId;
        // Validate against the active runway configuration. Real airports run
        // departures one wind direction at a time; we silently reject mis-side requests.
        const config = this.state.activeConfig ?? '16';
        const activeSet = KHEF_RUNWAY_CONFIGS[config].active;
        if (!activeSet.includes(runwayId)) {
            console.warn(`[Sim] Runway ${runwayId} is not active in config ${config}`);
            return;
        }

        const startNodeId = this.graph.findNearestNode(
            aircraft.position.lat,
            aircraft.position.lon
        );
        if (!startNodeId) {
            console.warn(`[Sim] Could not find start node for aircraft ${aircraft.id}`);
            return;
        }

        const holdShortNodeId = this.graph.getHoldShortNodeForRunway(runwayId);
        if (!holdShortNodeId) {
            console.warn(`[Sim] Could not find hold short node for runway ${runwayId}`);
            return;
        }

        // Don't taxi across any other OCCUPIED runway (someone lined up / taking off).
        const avoidNodes = this.taxiAvoidSet(runwayId);
        const route = this.graph.findPath(startNodeId, holdShortNodeId, {
            allowRunways: false,
            avoidNodes,
        });

        if (route) {
            aircraft.clearance = {
                type: 'TAXI',
                route: route,
                holdShort: holdShortNodeId,
            };
            aircraft.route = route;
            aircraft.targetIndex = 0;
            aircraft.speed = 60;
            aircraft.assignedRunwayId = runwayId;
        } else {
            console.warn(`[Sim] No path found from ${startNodeId} to ${holdShortNodeId}`);
        }
    }

    private handleTakeoffClearance(cmd: TakeoffClearanceCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) {
            console.warn(`[Sim] Aircraft ${cmd.payload.aircraftId} not found for takeoff`);
            return;
        }

        const isHoldingShort = ac.clearance?.type === 'TAXI' &&
            ac.route && ac.route.length > 0 &&
            (ac.targetIndex ?? 0) >= ac.route.length - 1;
        const isLinedUp = ac.clearance?.type === 'LINEUP';

        if (!isHoldingShort && !isLinedUp) {
            console.warn(`[Sim] Cannot takeoff: ${ac.callsign} not at hold short or lined up`);
            return;
        }

        const runwayState = this.runwayManager.getRunwayState(cmd.payload.runwayId);
        if (runwayState?.occupiedBy && runwayState.occupiedBy !== ac.id) {
            console.warn(`[Sim] Separation violation: Runway ${cmd.payload.runwayId} occupied`);
            return;
        }

        const lastDepartureTime = this.lastDeparture.get(cmd.payload.runwayId) ?? 0;
        const timeSinceLastDeparture = (this.state.timestamp - lastDepartureTime) / 1000;

        if (lastDepartureTime > 0 && timeSinceLastDeparture < MIN_SEPARATION_SECONDS) {
            console.warn(`[Sim] Separation: wait ${Math.ceil(MIN_SEPARATION_SECONDS - timeSinceLastDeparture)}s`);
            return;
        }

        this.lastDeparture.set(cmd.payload.runwayId, this.state.timestamp);

        const oppositeRunwayMap: Record<string, string> = {
            '16L': '34R', '34R': '16L',
            '16R': '34L', '34L': '16R'
        };
        const endRunwayId = oppositeRunwayMap[cmd.payload.runwayId];
        const endNodeId = this.graph.getRunwayEntryNode(endRunwayId);

        if (!endNodeId) {
            console.warn(`[Sim] Could not find end node for runway ${cmd.payload.runwayId}`);
            return;
        }

        const currentNodeId = this.graph.findNearestNode(ac.position.lat, ac.position.lon);
        if (!currentNodeId) {
            console.warn(`[Sim] Could not find start node for takeoff`);
            return;
        }

        const route = this.graph.findPath(currentNodeId, endNodeId, { allowRunways: true });

        const runwayHeadings: Record<string, number> = {
            '16L': 160, '16R': 160,
            '34R': 340, '34L': 340
        };
        const heading = runwayHeadings[cmd.payload.runwayId] || ac.position.heading;

        ac.clearance = { type: 'TAKEOFF', runwayId: cmd.payload.runwayId };
        ac.route = route || [];
        ac.targetIndex = 0;
        ac.speed = 0;
        ac.position.heading = heading;

        this.runwayManager.occupyRunway(cmd.payload.runwayId, ac.id);
    }

    private handleLandingClearance(cmd: LandingClearanceCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (ac) {
            ac.clearance = { type: 'LAND', runwayId: cmd.payload.runwayId };
            this.runwayManager.occupyRunway(cmd.payload.runwayId, ac.id);
        }
    }

    private deleteAircraft(cmd: DeleteAircraftCommand) {
        const index = this.state.aircraft.findIndex(a => a.id === cmd.payload.aircraftId);
        if (index !== -1) {
            const ac = this.state.aircraft[index];

            if (ac.clearance?.type === 'LINEUP' || ac.clearance?.type === 'TAKEOFF') {
                const runwayId = ac.clearance.runwayId;
                if (runwayId) {
                    this.runwayManager.releaseRunway(runwayId);
                }
            }

            this.state.aircraft.splice(index, 1);
        } else {
            console.warn(`[Sim] Aircraft ${cmd.payload.aircraftId} not found for deletion`);
        }
    }

    private handleLineUpAndWait(cmd: LineUpAndWaitCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) {
            console.warn(`[Sim] Aircraft ${cmd.payload.aircraftId} not found for line up and wait`);
            return;
        }

        const runwayId = cmd.payload.runwayId;
        const entryNodeId = this.graph.getRunwayEntryNode(runwayId);
        if (!entryNodeId) {
            console.warn(`[Sim] Could not find runway entry node for ${runwayId}`);
            return;
        }

        const currentNodeId = this.graph.findNearestNode(ac.position.lat, ac.position.lon);
        if (!currentNodeId) {
            console.warn(`[Sim] Could not find current node for aircraft ${ac.callsign}`);
            return;
        }

        const route = this.graph.findPath(currentNodeId, entryNodeId, { allowRunways: true });

        const runwayHeadings: Record<string, number> = {
            '16L': 160, '16R': 160,
            '34R': 340, '34L': 340
        };
        const heading = runwayHeadings[runwayId] || ac.position.heading;

        ac.clearance = { type: 'LINEUP', runwayId: runwayId };
        ac.route = route || [];
        ac.targetIndex = 0;
        ac.speed = 20;
        ac.position.heading = heading;

        this.runwayManager.occupyRunway(runwayId, ac.id);
    }

    private handleVector(cmd: VectorCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) return;

        if (ac.flightPhase === 'GROUND') {
            console.warn(`[Sim] Cannot issue vector to ground aircraft ${ac.callsign}`);
            return;
        }

        ac.clearance = { type: 'VECTOR', heading: cmd.payload.heading };
        ac.targetHeading = cmd.payload.heading;
    }

    private handleDirectTo(cmd: DirectToCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) return;

        if (ac.flightPhase === 'GROUND') {
            console.warn(`[Sim] Cannot issue direct-to to ground aircraft ${ac.callsign}`);
            return;
        }

        ac.clearance = {
            type: 'DIRECT_TO',
            fixId: cmd.payload.fixId,
            fixLat: cmd.payload.fixLat,
            fixLon: cmd.payload.fixLon
        };
    }

    private handleAltitude(cmd: AltitudeCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) return;

        if (ac.flightPhase === 'GROUND') {
            console.warn(`[Sim] Cannot issue altitude to ground aircraft ${ac.callsign}`);
            return;
        }

        const clearanceType = cmd.payload.isClimb ? 'CLIMB' : 'DESCEND';
        ac.clearance = { type: clearanceType, altitude: cmd.payload.altitude };
        ac.targetAltitude = cmd.payload.altitude;
    }

    private handleSpeed(cmd: SpeedCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) return;

        if (ac.flightPhase === 'GROUND') {
            console.warn(`[Sim] Cannot issue speed to ground aircraft ${ac.callsign}`);
            return;
        }

        ac.clearance = { type: 'SPEED', speed: cmd.payload.speed };
        ac.targetSpeed = cmd.payload.speed;
    }

    private handleHandoff(cmd: HandoffCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) return;

        ac.controllerId = cmd.payload.toController;

        if (cmd.payload.toController === 'APPROACH') {
            ac.flightPhase = 'APPROACH';
        } else if (cmd.payload.toController === 'DEPARTURE') {
            ac.flightPhase = 'DEPARTURE';
        }
    }

    private updatePhysics(ac: Aircraft, dt: number): Aircraft {
        if (ac.flightPhase && ac.flightPhase !== 'GROUND') {
            return this.updateAirbornePhysics(ac, dt);
        }

        if (ac.clearance?.type === 'TAKEOFF') {
            ac.speed = Math.min(ac.speed + 5, 140);
        } else if (ac.clearance?.type === 'LAND') {
            ac.speed = Math.max(ac.speed - 2, 20);
        }

        // Operator-issued hold (HUMAN mode Stop button or manual override).
        if (ac.manualHold) {
            return { ...ac, speed: 0 };
        }

        // Conflict halt: detectNearMisses() already set inConflictStop and zeroed speed.
        if (ac.inConflictStop) {
            return { ...ac, speed: 0 };
        }

        // Resume taxi after a transient halt clears.
        if (
            ac.speed === 0 &&
            ac.clearance?.type === 'TAXI' &&
            ac.route &&
            ac.targetIndex !== undefined &&
            ac.targetIndex < ac.route.length
        ) {
            ac.speed = 60;
        }

        if (!ac.route || ac.targetIndex === undefined || ac.targetIndex >= ac.route.length) {
            if (ac.speed > 0) {
                if (ac.clearance?.type === 'TAKEOFF') {
                    console.log(`[Sim] Aircraft ${ac.callsign} is now airborne and departed`);
                    this.runwayManager.releaseRunway(ac.clearance.runwayId);

                    // Mark DEPARTED immediately so the demo metrics tick over and
                    // the aircraft is removed from the map. We're not modeling the
                    // 50 nm airspace exit for a ground-taxi demo.
                    return {
                        ...ac,
                        speed: 180,
                        position: { ...ac.position, alt: 1000 },
                        flightPhase: 'DEPARTURE',
                        controllerId: 'DEPARTURE',
                        clearance: { type: 'DEPARTED' as const },
                        route: [],
                    };
                }
                return { ...ac, speed: 0 };
            }
            return ac;
        }

        const targetNodeId = ac.route[ac.targetIndex];
        const targetNode = this.graph.getNode(targetNodeId);

        if (!targetNode) {
            return { ...ac, speed: 0 };
        }

        const dx = targetNode.lon - ac.position.lon;
        const dy = targetNode.lat - ac.position.lat;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.00005) {
            // Don't snap onto a node where another aircraft is *stably* parked
            // (HOLD or LINEUP). This forms a real queue at hold-shorts. Two
            // *taxiing* aircraft are allowed to share/pass through the same
            // node — the 50 m proximity halt keeps them from physically colliding.
            const stablyOccupied = this.state.aircraft.some(other => {
                if (other.id === ac.id) return false;
                if (other.flightPhase && other.flightPhase !== 'GROUND') return false;
                const t = other.clearance?.type;
                if (t !== 'HOLD' && t !== 'LINEUP') return false;
                const d = this.graph.haversineMeters(
                    other.position.lat, other.position.lon,
                    targetNode.lat, targetNode.lon
                );
                return d < NODE_OCCUPIED_METERS;
            });
            if (stablyOccupied) {
                return { ...ac, speed: 0 };
            }

            const newTargetIndex = ac.targetIndex + 1;
            const clearance = ac.clearance;

            if (clearance && clearance.type === 'TAXI' && clearance.holdShort === targetNodeId) {
                console.log(`[Sim] Aircraft ${ac.callsign} holding short at ${targetNodeId}`);
                return {
                    ...ac,
                    position: { ...ac.position, lat: targetNode.lat, lon: targetNode.lon },
                    speed: 0,
                    clearance: { type: 'HOLD' },
                    targetIndex: newTargetIndex
                };
            }

            return {
                ...ac,
                position: { ...ac.position, lat: targetNode.lat, lon: targetNode.lon },
                targetIndex: newTargetIndex
            };
        }

        const bearing = this.bearing(ac.position.lat, ac.position.lon, targetNode.lat, targetNode.lon);
        const speedKmph = ac.speed * 1.852;
        const distKm = speedKmph * (dt / 3600);
        const moveDeg = distKm / 111.0;
        const ratio = moveDeg / dist;

        const newLat = ac.position.lat + dy * Math.min(ratio, 1);
        const newLon = ac.position.lon + dx * Math.min(ratio, 1);

        return {
            ...ac,
            position: {
                ...ac.position,
                lat: newLat,
                lon: newLon,
                heading: bearing
            }
        };
    }

    private bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
        const θ = Math.atan2(y, x);
        return (θ * 180 / Math.PI + 360) % 360;
    }

    private updateAirbornePhysics(ac: Aircraft, dt: number): Aircraft {
        let newHeading = ac.position.heading;
        let newAlt = ac.position.alt;
        let newSpeed = ac.speed;
        let newVerticalRate = ac.verticalRate || 0;

        if (ac.clearance?.type === 'VECTOR' && ac.targetHeading !== undefined) {
            newHeading = this.airNav.updateHeading(ac.position.heading, ac.targetHeading, dt);
        } else if (ac.clearance?.type === 'DIRECT_TO') {
            const bearingToFix = this.airNav.bearingToFix(
                ac.position.lat, ac.position.lon,
                ac.clearance.fixLat, ac.clearance.fixLon
            );
            newHeading = this.airNav.updateHeading(ac.position.heading, bearingToFix, dt);

            if (this.airNav.hasReachedFix(
                ac.position.lat, ac.position.lon,
                ac.clearance.fixLat, ac.clearance.fixLon
            )) {
                ac.clearance = { type: 'NONE' };
            }
        }

        if (ac.targetAltitude !== undefined && ac.targetAltitude !== ac.position.alt) {
            const altResult = this.airNav.updateAltitude(ac.position.alt, ac.targetAltitude, newVerticalRate, dt);
            newAlt = altResult.altitude;
            newVerticalRate = altResult.verticalRate;
        } else {
            newVerticalRate = 0;
        }

        if (ac.targetSpeed !== undefined && ac.targetSpeed !== ac.speed) {
            newSpeed = this.airNav.updateSpeed(ac.speed, ac.targetSpeed, dt);
        }

        const newPos = this.airNav.moveForward(ac.position.lat, ac.position.lon, newHeading, newSpeed, dt);

        const distFromAirport = this.airNav.distanceToFix(newPos.lat, newPos.lon, 38.7214, -77.5154);

        if (distFromAirport > 50) {
            console.log(`[Sim] Aircraft ${ac.callsign} left airspace`);
            return { ...ac, clearance: { type: 'DEPARTED' } };
        }

        return {
            ...ac,
            position: { lat: newPos.lat, lon: newPos.lon, alt: newAlt, heading: newHeading },
            speed: newSpeed,
            verticalRate: newVerticalRate
        };
    }
}
