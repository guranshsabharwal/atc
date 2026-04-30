export interface GraphNode {
    id: string;
    lat: number;
    lon: number;
}

export interface GraphEdge {
    from: string;
    to: string;
    distance: number;
    type?: string;
    ref?: string;
}

export interface GroundGraph {
    nodes: Record<string, GraphNode>;
    edges: GraphEdge[];
}

export class GraphManager {
    private nodes: Map<string, GraphNode> = new Map();
    private adjacency: Map<string, { to: string; distance: number; type?: string; ref?: string }[]> = new Map();

    private readonly GATE_START_NODES: Record<string, string> = {
        'TERMINAL': '-77.511210,38.723789',
        'APP_JET': '-77.515420,38.729067',
        'SOUTH_RAMP': '-77.517580,38.720492',
        'WEST_RAMP': '-77.519918,38.722276',
    };

    constructor(data: GroundGraph) {
        this.initFromData(data);
    }

    private initFromData(graph: GroundGraph) {
        Object.values(graph.nodes).forEach(node => {
            this.nodes.set(node.id, node);
            this.adjacency.set(node.id, []);
        });

        graph.edges.forEach(edge => {
            if (this.nodes.has(edge.from) && this.nodes.has(edge.to)) {
                this.adjacency.get(edge.from)?.push({ to: edge.to, distance: edge.distance, type: edge.type, ref: edge.ref });
                this.adjacency.get(edge.to)?.push({ to: edge.from, distance: edge.distance, type: edge.type, ref: edge.ref });
            }
        });

        console.log(`[GraphManager] Loaded ${this.nodes.size} nodes and ${graph.edges.length} edges.`);
        this.repairGraphConnectivity();
    }

    private repairGraphConnectivity() {
        const visited = new Set<string>();
        const components: string[][] = [];

        for (const nodeId of this.nodes.keys()) {
            if (!visited.has(nodeId)) {
                const component: string[] = [];
                const queue = [nodeId];
                visited.add(nodeId);

                while (queue.length > 0) {
                    const current = queue.shift()!;
                    component.push(current);

                    const neighbors = this.adjacency.get(current) || [];
                    for (const neighbor of neighbors) {
                        if (!visited.has(neighbor.to)) {
                            visited.add(neighbor.to);
                            queue.push(neighbor.to);
                        }
                    }
                }
                components.push(component);
            }
        }

        components.sort((a, b) => b.length - a.length);

        if (!components[0]) return;

        let removedNodes = 0;
        for (let i = 1; i < components.length; i++) {
            const island = components[i];
            if (island.length < 50) {
                island.forEach(id => {
                    this.nodes.delete(id);
                    this.adjacency.delete(id);
                    removedNodes++;
                });
            }
        }

        if (removedNodes > 0) {
            console.log(`[GraphManager] Pruned ${removedNodes} nodes from disconnected islands.`);
        }
    }

    public getStartNodeForGate(gateId: string, lat: number, lon: number, heading?: number): string | null {
        const explicitNode = this.GATE_START_NODES[gateId];
        if (explicitNode && this.nodes.has(explicitNode)) {
            return explicitNode;
        }
        return this.findNearestNode(lat, lon, heading);
    }

    public findNearestNode(lat: number, lon: number, heading?: number): string | null {
        let nearestId: string | null = null;
        let minDist = Infinity;

        for (const node of this.nodes.values()) {
            const d = this.haversine(lat, lon, node.lat, node.lon);

            if (d > 500) continue;

            if (heading !== undefined) {
                const bearingToNode = this.bearing(lat, lon, node.lat, node.lon);
                const angleDiff = Math.abs(this.getAngleDiff(heading, bearingToNode));

                if (angleDiff > 90 && d > 10) {
                    if (d + 100 < minDist) {
                        minDist = d + 100;
                        nearestId = node.id;
                    }
                    continue;
                }
            }

            if (d < minDist) {
                minDist = d;
                nearestId = node.id;
            }
        }
        return nearestId;
    }

    private getAngleDiff(a: number, b: number): number {
        let diff = b - a;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        return diff;
    }

    private bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const toRad = Math.PI / 180;
        const toDeg = 180 / Math.PI;

        const dLon = (lon2 - lon1) * toRad;
        const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
        const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
            Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);

        let brng = Math.atan2(y, x) * toDeg;
        return (brng + 360) % 360;
    }

    public getNode(id: string): GraphNode | undefined {
        return this.nodes.get(id);
    }

    public getRandomNodeId(): string | null {
        if (this.nodes.size === 0) return null;
        const ids = Array.from(this.nodes.keys());
        return ids[Math.floor(Math.random() * ids.length)];
    }

    public getReachableNodes(startId: string): string[] {
        if (!this.nodes.has(startId)) return [];

        const visited = new Set<string>();
        const queue = [startId];
        visited.add(startId);

        while (queue.length > 0) {
            const current = queue.shift()!;
            const neighbors = this.adjacency.get(current) || [];
            for (const n of neighbors) {
                if (!visited.has(n.to)) {
                    visited.add(n.to);
                    queue.push(n.to);
                }
            }
        }
        return Array.from(visited);
    }

    public findPath(startId: string, endId: string, options?: { allowRunways?: boolean }): string[] | null {
        if (!this.nodes.has(startId) || !this.nodes.has(endId)) {
            console.warn(`[GraphManager] Start or End node not found.`);
            return null;
        }

        const aStarPath = this.runAStar(startId, endId, options);
        if (aStarPath) {
            return aStarPath;
        }

        console.warn(`[GraphManager] A* failed, falling back to BFS.`);
        return this.runBFS(startId, endId, options);
    }

    private runAStar(startId: string, endId: string, options?: { allowRunways?: boolean }): string[] | null {
        const openSet: string[] = [startId];
        const cameFrom: Map<string, string> = new Map();
        const gScore: Map<string, number> = new Map();
        gScore.set(startId, 0);
        const fScore: Map<string, number> = new Map();
        fScore.set(startId, this.heuristic(startId, endId));
        const closedSet = new Set<string>();
        let ops = 0;
        const MAX_ITER = 30000;

        while (openSet.length > 0) {
            if (ops++ > MAX_ITER) {
                console.warn(`[GraphManager] A* aborted: exceeded ${MAX_ITER} iterations.`);
                return null;
            }

            let current = openSet[0];
            let lowestF = fScore.get(current) ?? Infinity;
            for (let i = 1; i < openSet.length; i++) {
                const node = openSet[i];
                const f = fScore.get(node) ?? Infinity;
                if (f < lowestF) {
                    lowestF = f;
                    current = node;
                }
            }

            const index = openSet.indexOf(current);
            if (index > -1) openSet.splice(index, 1);

            if (current === endId) return this.reconstructPath(cameFrom, current);

            closedSet.add(current);

            const neighbors = this.adjacency.get(current) || [];
            for (const neighbor of neighbors) {
                if (closedSet.has(neighbor.to)) continue;
                if (options?.allowRunways === false && neighbor.type === 'runway') continue;

                const dist = (neighbor.distance && neighbor.distance > 0) ? neighbor.distance : 1;
                const currentG = gScore.get(current) ?? Infinity;
                const tentativeGScore = currentG + dist;
                const neighborG = gScore.get(neighbor.to) ?? Infinity;

                if (tentativeGScore < neighborG) {
                    cameFrom.set(neighbor.to, current);
                    gScore.set(neighbor.to, tentativeGScore);
                    fScore.set(neighbor.to, tentativeGScore + this.heuristic(neighbor.to, endId));
                    if (!openSet.includes(neighbor.to)) openSet.push(neighbor.to);
                }
            }
        }
        return null;
    }

    private runBFS(startId: string, endId: string, options?: { allowRunways?: boolean }): string[] | null {
        const queue: string[] = [startId];
        const cameFrom: Map<string, string> = new Map();
        const visited = new Set<string>();
        visited.add(startId);

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current === endId) return this.reconstructPath(cameFrom, current);

            const neighbors = this.adjacency.get(current) || [];
            for (const n of neighbors) {
                if (options?.allowRunways === false && n.type === 'runway') continue;
                if (!visited.has(n.to)) {
                    visited.add(n.to);
                    cameFrom.set(n.to, current);
                    queue.push(n.to);
                }
            }
        }
        return null;
    }

    private heuristic(startId: string, endId: string): number {
        const start = this.nodes.get(startId);
        const end = this.nodes.get(endId);
        if (!start || !end) return 0;
        return this.haversine(start.lat, start.lon, end.lat, end.lon);
    }

    private reconstructPath(cameFrom: Map<string, string>, current: string): string[] {
        const totalPath = [current];
        while (cameFrom.has(current)) {
            current = cameFrom.get(current)!;
            totalPath.unshift(current);
        }
        return totalPath;
    }

    private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

        const clampedA = Math.max(0, Math.min(1, a));
        const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
        return R * c;
    }

    public getHoldShortNodeForRunway(runwayId: string): string | null {
        const holdShortAreas: Record<string, { lat: number; lon: number; searchRadius: number }> = {
            '16L': { lat: 38.7277, lon: -77.5185, searchRadius: 100 },
            '34R': { lat: 38.7133, lon: -77.5074, searchRadius: 200 },
            '16R': { lat: 38.7268, lon: -77.5215, searchRadius: 80 },
            '34L': { lat: 38.7152, lon: -77.5126, searchRadius: 200 }
        };

        const holdArea = holdShortAreas[runwayId];
        if (!holdArea) {
            console.warn(`[GraphManager] Unknown runway: ${runwayId}`);
            return null;
        }

        let bestNode: string | null = null;
        let bestDist = Infinity;

        for (const node of this.nodes.values()) {
            const dist = this.haversine(holdArea.lat, holdArea.lon, node.lat, node.lon);
            if (dist < holdArea.searchRadius && dist < bestDist) {
                bestDist = dist;
                bestNode = node.id;
            }
        }

        return bestNode;
    }

    public getRunwayEntryNode(runwayId: string): string | null {
        const runwayEntryPoints: Record<string, { lat: number; lon: number; searchRadius: number }> = {
            '16L': { lat: 38.7285, lon: -77.5210, searchRadius: 100 },
            '34R': { lat: 38.7129, lon: -77.5081, searchRadius: 200 },
            '16R': { lat: 38.7266, lon: -77.5210, searchRadius: 100 },
            '34L': { lat: 38.7152, lon: -77.5126, searchRadius: 200 }
        };

        const entryPoint = runwayEntryPoints[runwayId];
        if (!entryPoint) {
            console.warn(`[GraphManager] Unknown runway for entry: ${runwayId}`);
            return null;
        }

        let bestNode: string | null = null;
        let bestDist = Infinity;

        for (const node of this.nodes.values()) {
            const dist = this.haversine(entryPoint.lat, entryPoint.lon, node.lat, node.lon);
            if (dist < entryPoint.searchRadius && dist < bestDist) {
                bestDist = dist;
                bestNode = node.id;
            }
        }

        return bestNode;
    }
}
