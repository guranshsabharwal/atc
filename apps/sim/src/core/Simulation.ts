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
    Aircraft,
    KHEF_GATES,
    ControllerPosition
} from '@atc/shared';
import { GraphManager } from './GraphManager';
import { RunwayManager } from './RunwayManager';
import { AirNavigationManager } from './AirNavigationManager';

export class Simulation {
    private state: WorldState;
    private graph: GraphManager;
    private runwayManager: RunwayManager;
    private airNav: AirNavigationManager;

    constructor() {
        this.graph = new GraphManager();
        this.runwayManager = new RunwayManager();
        this.airNav = new AirNavigationManager();
        this.state = {
            aircraft: [],
            runways: [],
            timestamp: Date.now()
        };
    }

    public getState(): WorldState {
        // Sync Latest Runway State
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
        }
    }

    public tick(dt: number) {
        this.state.timestamp = Date.now();
        this.state.timestamp = Date.now();
        this.state.aircraft = this.state.aircraft
            .map(ac => this.updatePhysics(ac, dt))
            .filter(ac => ac.clearance?.type !== 'DEPARTED');

        // Incursion Check
        const alerts = this.runwayManager.checkForIncursions(this.state.aircraft);
        if (alerts.length > 0) {
            console.warn(`[Sim] Incursions Detected: ${alerts.join(', ')}`);
        }
        this.state.alerts = alerts;
    }

    private spawnAircraft(cmd: SpawnAircraftCommand) {
        let spawnPos = { lat: 0, lon: 0, alt: 0, heading: 0 };
        let startNodeId: string | null = null;

        if (cmd.payload.gateId) {
            const gate = KHEF_GATES.find(g => g.id === cmd.payload.gateId);
            if (gate) {
                spawnPos = { lat: gate.lat, lon: gate.lon, alt: 300, heading: gate.heading };
                console.log(`[Sim] Spawning at Gate ${gate.id}`);
            } else {
                console.warn(`[Sim] Gate ${cmd.payload.gateId} not found, defaulting`);
            }
        } else if (cmd.payload.startPosition) {
            spawnPos = cmd.payload.startPosition;
        }

        // Always use heading-aware findNearestNode to find nodes in direction aircraft is facing
        // This prevents backtracking by filtering out nodes behind the aircraft
        startNodeId = this.graph.findNearestNode(spawnPos.lat, spawnPos.lon, spawnPos.heading);

        let finalPos = { ...spawnPos };
        // Optional: Exact snap to node? Or keep gate pos? 
        // Let's keep gate pos visually, but route starts at node.

        const newAircraft: Aircraft = {
            id: Math.random().toString(36).substring(7),
            callsign: cmd.payload.callsign,
            position: finalPos,
            speed: 0,
            route: startNodeId ? [startNodeId] : [],
            targetIndex: 0,
            clearance: { type: 'NONE' }
        };

        // Mutable update is fine here since it's local state
        this.state.aircraft.push(newAircraft);
        console.log(`[Sim] Spawned ${newAircraft.callsign} at ${newAircraft.position.lat}, ${newAircraft.position.lon}`);
    }

    private issueTaxiClearance(cmd: IssueTaxiClearanceCommand) {
        const aircraft = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!aircraft) {
            console.warn(`[Sim] Aircraft ${cmd.payload.aircraftId} not found`);
            return;
        }

        // Always use aircraft's current position for pathfinding start
        // This prevents backtracking to the original spawn node
        const startNodeId = this.graph.findNearestNode(
            aircraft.position.lat,
            aircraft.position.lon
        );
        if (!startNodeId) {
            console.warn(`[Sim] Could not find start node for aircraft ${aircraft.id}`);
            return;
        }
        console.log(`[Sim] Using current position node: ${startNodeId}`);

        // Get the hold short node for the destination runway
        const runwayId = cmd.payload.destinationRunwayId;
        const holdShortNodeId = this.graph.getHoldShortNodeForRunway(runwayId);

        if (!holdShortNodeId) {
            console.warn(`[Sim] Could not find hold short node for runway ${runwayId}`);
            return;
        }

        console.log(`[Sim] Pathfinding from ${startNodeId} to hold short ${holdShortNodeId} for runway ${runwayId}`);
        const route = this.graph.findPath(startNodeId, holdShortNodeId, { allowRunways: false });

        if (route) {
            aircraft.clearance = {
                type: 'TAXI',
                route: route,
                holdShort: holdShortNodeId // Set the hold short node
            };
            aircraft.route = route;
            aircraft.targetIndex = 0;
            aircraft.speed = 60; // Taxi speed in knots (increased for testing)
            console.log(`[Sim] Path found: ${route.length} nodes, hold short at ${holdShortNodeId}`);
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

        // Validate aircraft is ready for takeoff
        // Must be either: holding short (taxi complete) or already lined up
        const isHoldingShort = ac.clearance?.type === 'TAXI' &&
            ac.route && ac.route.length > 0 &&
            (ac.targetIndex ?? 0) >= ac.route.length - 1;
        const isLinedUp = ac.clearance?.type === 'LINEUP';

        if (!isHoldingShort && !isLinedUp) {
            console.warn(`[Sim] Cannot takeoff: ${ac.callsign} not at hold short or lined up (clearance: ${ac.clearance?.type}, targetIndex: ${ac.targetIndex}, routeLen: ${ac.route?.length})`);
            return;
        }

        // === SEPARATION RULES ===
        // Check if runway is already occupied by another aircraft
        const runwayState = this.runwayManager.getRunwayState(cmd.payload.runwayId);
        if (runwayState?.occupiedBy && runwayState.occupiedBy !== ac.id) {
            console.warn(`[Sim] Separation violation: Runway ${cmd.payload.runwayId} occupied by ${runwayState.occupiedBy}`);
            console.warn(`SEPARATION: Cannot clear ${ac.callsign} for takeoff - runway occupied`);
            return;
        }

        // Check if last departure was too recent (60 second minimum)
        const lastDepartureKey = `lastDeparture_${cmd.payload.runwayId}`;
        const lastDepartureTime = (this as any)[lastDepartureKey] || 0;
        const timeSinceLastDeparture = (this.state.timestamp - lastDepartureTime) / 1000;
        const MIN_SEPARATION_SECONDS = 60;

        if (lastDepartureTime > 0 && timeSinceLastDeparture < MIN_SEPARATION_SECONDS) {
            console.warn(`[Sim] Separation violation: Only ${timeSinceLastDeparture.toFixed(0)}s since last departure (min: ${MIN_SEPARATION_SECONDS}s)`);
            console.warn(`SEPARATION: Wait ${Math.ceil(MIN_SEPARATION_SECONDS - timeSinceLastDeparture)}s for departure spacing`);
            return;
        }

        // Record this departure time
        (this as any)[lastDepartureKey] = this.state.timestamp;

        // Get runway end point (opposite runway entry)
        const oppositeRunwayMap: Record<string, string> = {
            '16L': '34R', '34R': '16L',
            '16R': '34L', '34L': '16R'
        };
        const endRunwayId = oppositeRunwayMap[cmd.payload.runwayId];
        const endNodeId = this.graph.getRunwayEntryNode(endRunwayId);

        if (!endNodeId) {
            console.warn(`[Sim] Could not find end node for runway ${cmd.payload.runwayId} (using ${endRunwayId})`);
            return;
        }

        // Find current node
        const currentNodeId = this.graph.findNearestNode(ac.position.lat, ac.position.lon);
        if (!currentNodeId) {
            console.warn(`[Sim] Could not find start node for takeoff`);
            return;
        }

        // Create route along runway
        const route = this.graph.findPath(currentNodeId, endNodeId, { allowRunways: true });

        // Runway headings (from runway designator - e.g. 16 = 160 degrees)
        const runwayHeadings: Record<string, number> = {
            '16L': 160, '16R': 160,
            '34R': 340, '34L': 340
        };
        const heading = runwayHeadings[cmd.payload.runwayId] || ac.position.heading;

        ac.clearance = { type: 'TAKEOFF', runwayId: cmd.payload.runwayId };
        ac.route = route || [];
        ac.targetIndex = 0;
        ac.speed = 0; // Accelerate from 0 or current speed
        ac.position.heading = heading;

        console.log(`[Sim] Aircraft ${ac.callsign} taking off from ${cmd.payload.runwayId}, route len: ${route?.length}`);
        this.runwayManager.occupyRunway(cmd.payload.runwayId, ac.id);
    }

    private handleLandingClearance(cmd: LandingClearanceCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (ac) {
            ac.clearance = { type: 'LAND', runwayId: cmd.payload.runwayId };
            console.log(`[Sim] Aircraft ${ac.callsign} landing on ${cmd.payload.runwayId}`);
            this.runwayManager.occupyRunway(cmd.payload.runwayId, ac.id);
        }
    }

    private deleteAircraft(cmd: DeleteAircraftCommand) {
        const index = this.state.aircraft.findIndex(a => a.id === cmd.payload.aircraftId);
        if (index !== -1) {
            console.log(`[Sim] Deleted aircraft ${this.state.aircraft[index].callsign}`);
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

        // Get runway entry point
        const runwayId = cmd.payload.runwayId;
        const entryNodeId = this.graph.getRunwayEntryNode(runwayId);
        if (!entryNodeId) {
            console.warn(`[Sim] Could not find runway entry node for ${runwayId}`);
            return;
        }

        // Find current position node (should be at hold short)
        const currentNodeId = this.graph.findNearestNode(ac.position.lat, ac.position.lon);
        if (!currentNodeId) {
            console.warn(`[Sim] Could not find current node for aircraft ${ac.callsign}`);
            return;
        }

        // Create route from hold short to runway entry (allow runways for this)
        const route = this.graph.findPath(currentNodeId, entryNodeId, { allowRunways: true });

        // Runway headings (from runway designator - e.g. 16 = 160 degrees)
        const runwayHeadings: Record<string, number> = {
            '16L': 160, '16R': 160,
            '34R': 340, '34L': 340
        };

        const heading = runwayHeadings[runwayId] || ac.position.heading;

        ac.clearance = { type: 'LINEUP', runwayId: runwayId };
        ac.route = route || [];
        ac.targetIndex = 0;
        ac.speed = 20; // Slow taxi onto runway
        ac.position.heading = heading; // Align with runway

        console.log(`[Sim] Aircraft ${ac.callsign} lining up on ${runwayId}, route: ${route?.length || 0} nodes`);
        this.runwayManager.occupyRunway(runwayId, ac.id);
    }

    // Phase 6: Air Navigation Command Handlers

    private handleVector(cmd: VectorCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) {
            console.warn(`[Sim] Aircraft ${cmd.payload.aircraftId} not found for vector`);
            return;
        }

        // Only allow vector for airborne aircraft
        if (ac.flightPhase === 'GROUND') {
            console.warn(`[Sim] Cannot issue vector to ground aircraft ${ac.callsign}`);
            return;
        }

        ac.clearance = { type: 'VECTOR', heading: cmd.payload.heading };
        ac.targetHeading = cmd.payload.heading;
        console.log(`[Sim] Aircraft ${ac.callsign} vectored to heading ${cmd.payload.heading}`);
    }

    private handleDirectTo(cmd: DirectToCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) {
            console.warn(`[Sim] Aircraft ${cmd.payload.aircraftId} not found for direct-to`);
            return;
        }

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
        console.log(`[Sim] Aircraft ${ac.callsign} proceeding direct to ${cmd.payload.fixId}`);
    }

    private handleAltitude(cmd: AltitudeCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) {
            console.warn(`[Sim] Aircraft ${cmd.payload.aircraftId} not found for altitude`);
            return;
        }

        if (ac.flightPhase === 'GROUND') {
            console.warn(`[Sim] Cannot issue altitude to ground aircraft ${ac.callsign}`);
            return;
        }

        const clearanceType = cmd.payload.isClimb ? 'CLIMB' : 'DESCEND';
        ac.clearance = { type: clearanceType, altitude: cmd.payload.altitude };
        ac.targetAltitude = cmd.payload.altitude;
        console.log(`[Sim] Aircraft ${ac.callsign} ${clearanceType.toLowerCase()} to ${cmd.payload.altitude} ft`);
    }

    private handleSpeed(cmd: SpeedCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) {
            console.warn(`[Sim] Aircraft ${cmd.payload.aircraftId} not found for speed`);
            return;
        }

        if (ac.flightPhase === 'GROUND') {
            console.warn(`[Sim] Cannot issue speed to ground aircraft ${ac.callsign}`);
            return;
        }

        ac.clearance = { type: 'SPEED', speed: cmd.payload.speed };
        ac.targetSpeed = cmd.payload.speed;
        console.log(`[Sim] Aircraft ${ac.callsign} speed assigned: ${cmd.payload.speed} kts`);
    }

    private handleHandoff(cmd: HandoffCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) {
            console.warn(`[Sim] Aircraft ${cmd.payload.aircraftId} not found for handoff`);
            return;
        }

        const previousController = ac.controllerId || 'unassigned';
        ac.controllerId = cmd.payload.toController;

        // Update flight phase based on controller
        if (cmd.payload.toController === 'APPROACH') {
            ac.flightPhase = 'APPROACH';
        } else if (cmd.payload.toController === 'DEPARTURE') {
            ac.flightPhase = 'DEPARTURE';
        }

        console.log(`[Sim] Aircraft ${ac.callsign} handed off from ${previousController} to ${cmd.payload.toController}`);
    }

    private updatePhysics(ac: Aircraft, dt: number): Aircraft {
        // Phase 6: Handle airborne aircraft separately
        if (ac.flightPhase && ac.flightPhase !== 'GROUND') {
            return this.updateAirbornePhysics(ac, dt);
        }

        // Ground movement physics (existing logic)
        // Handle speed updates based on state
        if (ac.clearance?.type === 'TAKEOFF') {
            // Accelerate to takeoff speed
            ac.speed = Math.min(ac.speed + 5, 140); // Simple acceleration
        } else if (ac.clearance?.type === 'LAND') {
            // Decelerate
            ac.speed = Math.max(ac.speed - 2, 20);
        }

        // === GROUND SEPARATION CHECK ===
        // Prevent stacking by checking distance to other aircraft
        // Separation threshold: ~50 meters (approx 0.00045 degrees)
        const MIN_GROUND_SEPARATION = 0.00045;

        // Only apply separation if we are moving (speed > 0) and not on active runway operation (TAKEOFF/LAND)
        // We allow stacking for TAKEOFF/LAND slightly to prevent freezing on runway, but mostly relying on runway occupancy logic there.
        // Actually, we should enforce it everywhere on ground to look realistic, except maybe when passing?
        // Simpler for now: enforce everywhere on ground.
        if (ac.speed > 0 && ac.flightPhase === 'GROUND') {
            const tooClose = this.state.aircraft.some(other => {
                if (other.id === ac.id) return false;
                if (other.flightPhase !== 'GROUND') return false;

                const dx = other.position.lon - ac.position.lon;
                const dy = other.position.lat - ac.position.lat;
                const distSq = dx * dx + dy * dy;

                // Check if other aircraft is close
                if (distSq < MIN_GROUND_SEPARATION * MIN_GROUND_SEPARATION) {
                    return true;
                }
                return false;
            });

            if (tooClose) {
                // Determine who should yield. 
                // Simple heuristic: The one 'behind' (or arbitrary ID sort if close) yields.
                // But since we are iterating, if we just stop, we might deadlock. 
                // Better heuristic: Stop if the other aircraft is *ahead* of us in our general direction.
                // For MVP: Just stop. If both stop, it's a deadlock, but solves stacking. user can resolve by moving one.
                // To avoid flickering stop/start, we might want a hysteresis, but let's try simple stop first.
                return { ...ac, speed: 0 };
            }
        }

        if (!ac.route || ac.targetIndex === undefined || ac.targetIndex >= ac.route.length) {
            if (ac.speed > 0) {
                // If we finished the route during TAKEOFF, aircraft becomes airborne
                if (ac.clearance?.type === 'TAKEOFF') {
                    console.log(`[Sim] Aircraft ${ac.callsign} is now airborne!`);

                    // Release the runway
                    this.runwayManager.releaseRunway(ac.clearance.runwayId);

                    // Transition to airborne state
                    return {
                        ...ac,
                        speed: 180, // Initial airborne speed
                        position: { ...ac.position, alt: 1000 }, // Initial altitude
                        flightPhase: 'DEPARTURE',
                        controllerId: 'DEPARTURE',
                        targetAltitude: 3000, // Default initial climb
                        targetSpeed: 200,
                        route: [],
                    };
                }
                // For other clearances (TAXI, LINEUP), stop but keep clearance
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

        // Threshold 0.00005 deg is roughly 5 meters
        if (dist < 0.00005) {
            const newTargetIndex = ac.targetIndex + 1;

            // Check if we've reached the hold short node
            const clearance = ac.clearance;
            if (clearance && clearance.type === 'TAXI' && clearance.holdShort === targetNodeId) {
                // Aircraft has reached hold short - STOP and wait
                console.log(`[Sim] Aircraft ${ac.callsign} holding short at ${targetNodeId}`);
                return {
                    ...ac,
                    position: { ...ac.position, lat: targetNode.lat, lon: targetNode.lon },
                    speed: 0,
                    clearance: { type: 'HOLD' }, // Change to HOLD state
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

        // Move
        // 20 knots ~ 10 m/s ~ 36 km/h
        const speedKmph = ac.speed * 1.852;
        const distKm = speedKmph * (dt / 3600); // hours

        // 1 deg lat approx 111km
        const moveDeg = distKm / 111.0;

        // This is a rough euclidean approximation for small distances which is fine for airport taxi
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
        const brng = (θ * 180 / Math.PI + 360) % 360;
        return brng;
    }

    private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // Phase 6: Airborne aircraft physics
    private updateAirbornePhysics(ac: Aircraft, dt: number): Aircraft {
        let newHeading = ac.position.heading;
        let newAlt = ac.position.alt;
        let newSpeed = ac.speed;
        let newVerticalRate = ac.verticalRate || 0;

        // Update heading based on clearance
        if (ac.clearance?.type === 'VECTOR' && ac.targetHeading !== undefined) {
            newHeading = this.airNav.updateHeading(
                ac.position.heading,
                ac.targetHeading,
                dt
            );
        } else if (ac.clearance?.type === 'DIRECT_TO') {
            // Calculate bearing to fix
            const bearingToFix = this.airNav.bearingToFix(
                ac.position.lat, ac.position.lon,
                ac.clearance.fixLat, ac.clearance.fixLon
            );
            newHeading = this.airNav.updateHeading(ac.position.heading, bearingToFix, dt);

            // Check if reached fix
            if (this.airNav.hasReachedFix(
                ac.position.lat, ac.position.lon,
                ac.clearance.fixLat, ac.clearance.fixLon
            )) {
                console.log(`[Sim] Aircraft ${ac.callsign} reached ${ac.clearance.fixId}`);
                // Clear the direct-to clearance
                ac.clearance = { type: 'NONE' };
            }
        }

        // Update altitude
        if (ac.targetAltitude !== undefined && ac.targetAltitude !== ac.position.alt) {
            const altResult = this.airNav.updateAltitude(
                ac.position.alt,
                ac.targetAltitude,
                newVerticalRate,
                dt
            );
            newAlt = altResult.altitude;
            newVerticalRate = altResult.verticalRate;
        } else {
            newVerticalRate = 0;
        }

        // Update speed
        if (ac.targetSpeed !== undefined && ac.targetSpeed !== ac.speed) {
            newSpeed = this.airNav.updateSpeed(ac.speed, ac.targetSpeed, dt);
        }

        // Move forward based on current heading and speed
        const newPos = this.airNav.moveForward(
            ac.position.lat,
            ac.position.lon,
            newHeading,
            newSpeed,
            dt
        );

        // Check if aircraft is out of range (simplified: 50nm from KHEF)
        const distFromAirport = this.airNav.distanceToFix(
            newPos.lat, newPos.lon,
            38.7214, -77.5154 // KHEF center
        );

        if (distFromAirport > 50) {
            console.log(`[Sim] Aircraft ${ac.callsign} left airspace (${distFromAirport.toFixed(1)} nm)`);
            return {
                ...ac,
                clearance: { type: 'DEPARTED' }
            };
        }

        return {
            ...ac,
            position: {
                lat: newPos.lat,
                lon: newPos.lon,
                alt: newAlt,
                heading: newHeading
            },
            speed: newSpeed,
            verticalRate: newVerticalRate
        };
    }
}
