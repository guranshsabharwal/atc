import {
    WorldState,
    Command,
    SpawnAircraftCommand,
    IssueTaxiClearanceCommand,
    Aircraft
} from '@atc/shared';
import { GraphManager } from './GraphManager';

export class Simulation {
    private state: WorldState;
    private graph: GraphManager;

    constructor() {
        this.graph = new GraphManager();
        this.state = {
            aircraft: [],
            timestamp: Date.now()
        };
    }

    public getState(): WorldState {
        return this.state;
    }

    public handleCommand(cmd: Command) {
        if (cmd.type === 'spawnAircraft') {
            this.spawnAircraft(cmd as SpawnAircraftCommand);
        } else if (cmd.type === 'issueTaxiClearance') {
            this.issueTaxiClearance(cmd as IssueTaxiClearanceCommand);
        }
    }

    public tick(dt: number) {
        this.state.timestamp = Date.now();
        this.state.aircraft = this.state.aircraft.map(ac => this.updatePhysics(ac, dt));
    }

    private spawnAircraft(cmd: SpawnAircraftCommand) {
        // Snap to nearest graph node
        const startNodeId = this.graph.findNearestNode(
            cmd.payload.startPosition.lat,
            cmd.payload.startPosition.lon
        );

        let finalPos = { ...cmd.payload.startPosition };
        if (startNodeId) {
            const node = this.graph.getNode(startNodeId);
            if (node) {
                finalPos.lat = node.lat;
                finalPos.lon = node.lon;
            }
        }

        const newAircraft: Aircraft = {
            id: Math.random().toString(36).substring(7),
            callsign: cmd.payload.callsign,
            position: finalPos,
            speed: 0,
            route: startNodeId ? [startNodeId] : [],
            targetIndex: 0
        };

        // Mutable update is fine here since it's local state
        this.state.aircraft.push(newAircraft);
        console.log(`[Sim] Spawned ${newAircraft.callsign} at ${newAircraft.position.lat}, ${newAircraft.position.lon}`);
    }

    private issueTaxiClearance(cmd: IssueTaxiClearanceCommand) {
        // We find the aircraft in the array. Since we will modify it, we can just mutate the object
        // if we are careful, or map it in tick. 
        // For 'issueTaxiClearance', we usually modify the aircraft state immediately.
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) return;

        // Determine Start Node
        let startNodeId = ac.route && ac.route.length > 0 ? ac.route[ac.route.length - 1] : null;

        if (!startNodeId) {
            startNodeId = this.graph.findNearestNode(ac.position.lat, ac.position.lon);
        }

        if (!startNodeId) {
            console.warn(`[Sim] Could not resolve start node for aircraft ${ac.callsign}`);
            return;
        }

        let destNodeId = cmd.payload.destinationNodeId;

        if (destNodeId === 'test_node') {
            const reachable = this.graph.getReachableNodes(startNodeId);
            const validTargets = reachable.filter(id => id !== startNodeId);

            if (validTargets.length > 0) {
                destNodeId = validTargets[Math.floor(Math.random() * validTargets.length)];

                console.log(`[Sim] Pathfinding from ${startNodeId} to ${destNodeId}`);
                const path = this.graph.findPath(startNodeId, destNodeId);

                if (path && path.length > 0) {
                    console.log(`[Sim] Path found to ${destNodeId}: ${path.length} nodes`);
                    ac.clearance = {
                        type: 'TAXI',
                        route: path,
                        holdShort: undefined
                    };
                    ac.route = path;
                    ac.targetIndex = 1;
                    ac.speed = 20;
                    return;
                }
            }

            console.warn(`[Sim] No reachable nodes found from ${startNodeId} (Component size: ${reachable.length})`);
            this.graph.debugConnectivity(startNodeId);
            return;
        }

        if (destNodeId) {
            console.log(`[Sim] Pathfinding from ${startNodeId} to ${destNodeId}`);
            const path = this.graph.findPath(startNodeId, destNodeId);

            if (path && path.length > 0) {
                console.log(`[Sim] Path found: ${path.length} nodes`);
                ac.clearance = {
                    type: 'TAXI',
                    route: path,
                    holdShort: undefined
                };
                ac.route = path;
                ac.targetIndex = 1;
                ac.speed = 20;
            } else {
                console.warn(`[Sim] No path found between ${startNodeId} and ${destNodeId}`);
            }
        }
    }

    private updatePhysics(ac: Aircraft, dt: number): Aircraft {
        // Return a new object if changes happen, or original if not
        if (!ac.route || ac.targetIndex === undefined || ac.targetIndex >= ac.route.length) {
            if (ac.speed > 0) {
                return { ...ac, speed: 0, clearance: { type: 'NONE' } };
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
            return {
                ...ac,
                position: { ...ac.position, lat: targetNode.lat, lon: targetNode.lon },
                targetIndex: ac.targetIndex + 1
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

        // If ratio > 1, we overshoot, but next tick will catch it or we snap above
        // For smoothness, if ratio > 1, just snap? No, let's just move.

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
}
