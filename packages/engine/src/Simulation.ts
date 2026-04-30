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
} from '@atc/shared';
import { GraphManager, GroundGraph } from './GraphManager';
import { RunwayManager } from './RunwayManager';
import { AirNavigationManager } from './AirNavigationManager';

export class Simulation {
    private state: WorldState;
    private graph: GraphManager;
    private runwayManager: RunwayManager;
    private airNav: AirNavigationManager;

    constructor(graphData: GroundGraph) {
        this.graph = new GraphManager(graphData);
        this.runwayManager = new RunwayManager();
        this.airNav = new AirNavigationManager();
        this.state = {
            aircraft: [],
            runways: [],
            timestamp: Date.now()
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
        }
    }

    public tick(dt: number) {
        this.state.timestamp = Date.now();
        this.state.aircraft = this.state.aircraft
            .map(ac => this.updatePhysics(ac, dt))
            .filter(ac => ac.clearance?.type !== 'DEPARTED');

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
            } else {
                console.warn(`[Sim] Gate ${cmd.payload.gateId} not found, defaulting`);
            }
        } else if (cmd.payload.startPosition) {
            spawnPos = cmd.payload.startPosition;
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

        const startNodeId = this.graph.findNearestNode(
            aircraft.position.lat,
            aircraft.position.lon
        );
        if (!startNodeId) {
            console.warn(`[Sim] Could not find start node for aircraft ${aircraft.id}`);
            return;
        }

        const runwayId = cmd.payload.destinationRunwayId;
        const holdShortNodeId = this.graph.getHoldShortNodeForRunway(runwayId);

        if (!holdShortNodeId) {
            console.warn(`[Sim] Could not find hold short node for runway ${runwayId}`);
            return;
        }

        const route = this.graph.findPath(startNodeId, holdShortNodeId, { allowRunways: false });

        if (route) {
            aircraft.clearance = {
                type: 'TAXI',
                route: route,
                holdShort: holdShortNodeId
            };
            aircraft.route = route;
            aircraft.targetIndex = 0;
            aircraft.speed = 60;
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

        const lastDepartureKey = `lastDeparture_${cmd.payload.runwayId}`;
        const lastDepartureTime = (this as any)[lastDepartureKey] || 0;
        const timeSinceLastDeparture = (this.state.timestamp - lastDepartureTime) / 1000;
        const MIN_SEPARATION_SECONDS = 60;

        if (lastDepartureTime > 0 && timeSinceLastDeparture < MIN_SEPARATION_SECONDS) {
            console.warn(`[Sim] Separation: wait ${Math.ceil(MIN_SEPARATION_SECONDS - timeSinceLastDeparture)}s`);
            return;
        }

        (this as any)[lastDepartureKey] = this.state.timestamp;

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

        const MIN_GROUND_SEPARATION = 0.00045;

        if (ac.speed > 0 && ac.flightPhase === 'GROUND') {
            const tooClose = this.state.aircraft.some(other => {
                if (other.id === ac.id) return false;
                if (other.flightPhase !== 'GROUND') return false;

                const dx = other.position.lon - ac.position.lon;
                const dy = other.position.lat - ac.position.lat;
                const distSq = dx * dx + dy * dy;

                return distSq < MIN_GROUND_SEPARATION * MIN_GROUND_SEPARATION;
            });

            if (tooClose) {
                return { ...ac, speed: 0 };
            }
        }

        if (!ac.route || ac.targetIndex === undefined || ac.targetIndex >= ac.route.length) {
            if (ac.speed > 0) {
                if (ac.clearance?.type === 'TAKEOFF') {
                    console.log(`[Sim] Aircraft ${ac.callsign} is now airborne!`);
                    this.runwayManager.releaseRunway(ac.clearance.runwayId);

                    return {
                        ...ac,
                        speed: 180,
                        position: { ...ac.position, alt: 1000 },
                        flightPhase: 'DEPARTURE',
                        controllerId: 'DEPARTURE',
                        targetAltitude: 3000,
                        targetSpeed: 200,
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
