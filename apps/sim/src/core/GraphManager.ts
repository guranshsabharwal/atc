import fs from 'fs';
import path from 'path';

interface GraphNode {
    id: string;
    lat: number;
    lon: number;
}

interface GraphEdge {
    from: string;
    to: string;
    distance: number;
}

interface GroundGraph {
    nodes: Record<string, GraphNode>;
    edges: GraphEdge[];
}

export class GraphManager {
    private nodes: Map<string, GraphNode> = new Map();
    private adjacency: Map<string, { to: string; distance: number }[]> = new Map();

    constructor() {
        this.loadGraph();
    }

    private loadGraph() {
        try {
            const graphPath = path.resolve(__dirname, '../../../../data/derived/khef/graph.json');

            if (!fs.existsSync(graphPath)) {
                console.error(`Graph file not found at ${graphPath}`);
                return;
            }

            const rawData = fs.readFileSync(graphPath, 'utf-8');
            const graph: GroundGraph = JSON.parse(rawData);

            Object.values(graph.nodes).forEach(node => {
                this.nodes.set(node.id, node);
                this.adjacency.set(node.id, []);
            });

            graph.edges.forEach(edge => {
                if (this.nodes.has(edge.from) && this.nodes.has(edge.to)) {
                    this.adjacency.get(edge.from)?.push({ to: edge.to, distance: edge.distance });
                    this.adjacency.get(edge.to)?.push({ to: edge.from, distance: edge.distance });
                }
            });

            console.log(`[GraphManager] Loaded ${this.nodes.size} nodes and ${graph.edges.length} edges (bidirectional).`);
        } catch (e) {
            console.error('[GraphManager] Failed to load graph:', e);
        }
    }

    public findNearestNode(lat: number, lon: number): string | null {
        let nearestId: string | null = null;
        let minDist = Infinity;

        for (const node of this.nodes.values()) {
            const d = this.haversine(lat, lon, node.lat, node.lon);
            if (d < minDist) {
                minDist = d;
                nearestId = node.id;
            }
        }
        return nearestId;
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

    public debugConnectivity(startId: string) {
        const reachable = this.getReachableNodes(startId);
        console.log(`[GraphManager] Node ${startId} can reach ${reachable.length} / ${this.nodes.size} nodes.`);
    }

    // A* Pathfinding with BFS Fallback
    public findPath(startId: string, endId: string): string[] | null {
        if (!this.nodes.has(startId) || !this.nodes.has(endId)) {
            console.warn(`[GraphManager] Start or End node not found.`);
            return null;
        }

        // Try A* First
        const aStarPath = this.runAStar(startId, endId);
        if (aStarPath) {
            return aStarPath;
        }

        console.warn(`[GraphManager] A* failed to find path from ${startId} to ${endId}. Falling back to BFS.`);

        // Fallback to BFS
        return this.runBFS(startId, endId);
    }

    private runAStar(startId: string, endId: string): string[] | null {
        const openSet: string[] = [startId];
        const cameFrom: Map<string, string> = new Map();

        const gScore: Map<string, number> = new Map();
        gScore.set(startId, 0);

        const fScore: Map<string, number> = new Map();
        const initialH = this.heuristic(startId, endId);
        fScore.set(startId, initialH);

        const closedSet = new Set<string>();
        let ops = 0;
        const MAX_ITER = 30000;

        while (openSet.length > 0) {
            if (ops++ > MAX_ITER) {
                console.warn(`[GraphManager] A* aborted: Exceeded ${MAX_ITER} iterations. Nodes: ${this.nodes.size}`);
                return null;
            }

            // Find node with lowest fScore (O(N) linear scan)
            let current = openSet[0];
            let lowestF = fScore.get(current) ?? Infinity; // Fix: Use ?? to handle 0

            for (let i = 1; i < openSet.length; i++) {
                const node = openSet[i];
                const f = fScore.get(node) ?? Infinity; // Fix: Use ??
                if (f < lowestF) {
                    lowestF = f;
                    current = node;
                }
            }

            // Remove current
            const index = openSet.indexOf(current);
            if (index > -1) {
                openSet.splice(index, 1);
            }

            if (current === endId) {
                return this.reconstructPath(cameFrom, current);
            }

            closedSet.add(current);

            const neighbors = this.adjacency.get(current) || [];

            for (const neighbor of neighbors) {
                if (closedSet.has(neighbor.to)) continue;

                const dist = (neighbor.distance && neighbor.distance > 0) ? neighbor.distance : 1;

                // CRITICAL FIX: Handle 0 value correctly using ?? instead of ||
                const currentG = gScore.get(current) ?? Infinity;
                const tentativeGScore = currentG + dist;

                const neighborG = gScore.get(neighbor.to) ?? Infinity;

                if (tentativeGScore < neighborG) {
                    cameFrom.set(neighbor.to, current);
                    gScore.set(neighbor.to, tentativeGScore);
                    fScore.set(neighbor.to, tentativeGScore + this.heuristic(neighbor.to, endId));

                    if (!openSet.includes(neighbor.to)) {
                        openSet.push(neighbor.to);
                    }
                }
            }
        }

        return null;
    }

    private runBFS(startId: string, endId: string): string[] | null {
        const queue: string[] = [startId];
        const cameFrom: Map<string, string> = new Map();
        const visited = new Set<string>();
        visited.add(startId);

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current === endId) return this.reconstructPath(cameFrom, current);

            const neighbors = this.adjacency.get(current) || [];

            for (const n of neighbors) {
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

        // Clamp to [0, 1] to avoid NaN from floating point errors
        const clampedA = Math.max(0, Math.min(1, a));
        const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

        return R * c;
    }
}
