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
    type?: string;  // 'taxiway' | 'runway'
    ref?: string;   // Taxiway/runway identifier like 'A', '16L'
}

interface GroundGraph {
    nodes: Record<string, GraphNode>;
    edges: GraphEdge[];
}

export class GraphManager {
    private nodes: Map<string, GraphNode> = new Map();
    private adjacency: Map<string, { to: string; distance: number; type?: string; ref?: string }[]> = new Map();

    // Explicit gate-to-graph-node mappings to prevent backtracking on route start
    // These node IDs are verified to exist in graph.json
    private readonly GATE_START_NODES: Record<string, string> = {
        'TERMINAL': '-77.511210,38.723789',   // Verified: graph.json line 3-7, on Taxiway Z
        'APP_JET': '-77.515420,38.729067',    // On Taxiway Z heading toward A
        'SOUTH_RAMP': '-77.517580,38.720492', // Near Taxiway A/B intersection
        'WEST_RAMP': '-77.519918,38.722276',  // On Taxiway A west side
    };

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
                    this.adjacency.get(edge.from)?.push({ to: edge.to, distance: edge.distance, type: edge.type, ref: edge.ref });
                    this.adjacency.get(edge.to)?.push({ to: edge.from, distance: edge.distance, type: edge.type, ref: edge.ref });
                }
            });

            console.log(`[GraphManager] Loaded ${this.nodes.size} nodes and ${graph.edges.length} edges.`);
            this.repairGraphConnectivity();
        } catch (e) {
            console.error('[GraphManager] Failed to load graph:', e);
        }
    }

    private repairGraphConnectivity() {
        const visited = new Set<string>();
        const components: string[][] = [];

        // Find all connected components
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

        // Identify main component (largest)
        components.sort((a, b) => b.length - a.length);
        const mainComponent = components[0];

        if (!mainComponent) return;

        const originalCount = this.nodes.size;
        console.log(`[GraphManager] Found ${components.length} connected components.`);
        console.log(`[GraphManager] Main component size: ${mainComponent.length} nodes.`);

        let removedNodes = 0;
        // 3. Try to bridge smaller components to the main one
        for (let i = 1; i < components.length; i++) {
            const island = components[i];

            // Find all valid candidates within threshold
            const candidates: { islandNode: string, mainNode: string, dist: number }[] = [];

            for (const islandNodeId of island) {
                const islandNode = this.nodes.get(islandNodeId)!;

                for (const mainNodeId of mainComponent) {
                    const mainNode = this.nodes.get(mainNodeId)!;
                    const d = this.haversine(islandNode.lat, islandNode.lon, mainNode.lat, mainNode.lon);

                    if (d < 200) {
                        candidates.push({ islandNode: islandNodeId, mainNode: mainNodeId, dist: d });
                    }
                }
            }

            // 4. Decision: Bridge or Prune?
            // 4. Decision: Always Prune (as requested to remove "island" entirely)
            // User requested to "delete this little island in general"
            if (island.length < 50) {
                console.log(`[GraphManager] Pruning isolated island (size ${island.length})`);
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

    /**
     * Get the preferred start node for a gate. Uses explicit mapping if available,
     * otherwise falls back to findNearestNode.
     */
    public getStartNodeForGate(gateId: string, lat: number, lon: number, heading?: number): string | null {
        // Check explicit mapping first
        const explicitNode = this.GATE_START_NODES[gateId];
        if (explicitNode && this.nodes.has(explicitNode)) {
            console.log(`[GraphManager] Using explicit start node for ${gateId}: ${explicitNode}`);
            return explicitNode;
        }

        // Fall back to nearest node search
        return this.findNearestNode(lat, lon, heading);
    }

    public findNearestNode(lat: number, lon: number, heading?: number): string | null {
        let nearestId: string | null = null;
        let minDist = Infinity;

        for (const node of this.nodes.values()) {
            const d = this.haversine(lat, lon, node.lat, node.lon);

            // Optimization: Skip if too far (e.g., > 500m) to save CPU
            if (d > 500) continue;

            // Directional Logic: If heading is provided (aircraft is moving), 
            // avoid snapping to nodes *behind* the aircraft to prevent backtracking.
            if (heading !== undefined) {
                const bearingToNode = this.bearing(lat, lon, node.lat, node.lon);
                const angleDiff = Math.abs(this.getAngleDiff(heading, bearingToNode));

                // If the node is behind us (> 90 degrees), heavily penalize the distance 
                // effectively making it "farther" than nodes in front.
                // Exception: If we are extremely close (< 10m), it's probably the node we are on, so accept it.
                if (angleDiff > 90 && d > 10) {
                    // Add penalty (e.g. +100m) so we prefer a slightly further node in FRONT
                    // rather than a closer node BEHIND.
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

    public debugConnectivity(startId: string) {
        const reachable = this.getReachableNodes(startId);
        console.log(`[GraphManager] Node ${startId} can reach ${reachable.length} / ${this.nodes.size} nodes.`);
    }

    // A* Pathfinding with BFS Fallback
    public findPath(startId: string, endId: string, options?: { allowRunways?: boolean }): string[] | null {
        if (!this.nodes.has(startId) || !this.nodes.has(endId)) {
            console.warn(`[GraphManager] Start or End node not found.`);
            return null;
        }

        // Try A* First
        const aStarPath = this.runAStar(startId, endId, options);
        if (aStarPath) {
            return aStarPath;
        }

        console.warn(`[GraphManager] A* failed to find path from ${startId} to ${endId}. Falling back to BFS.`);

        // Fallback to BFS
        return this.runBFS(startId, endId, options);
    }

    private runAStar(startId: string, endId: string, options?: { allowRunways?: boolean }): string[] | null {
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

                // Skip runway edges during taxi unless explicitly allowed
                if (options?.allowRunways === false && neighbor.type === 'runway') continue;
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
                // Skip runway edges during taxi unless explicitly allowed
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

        // Clamp to [0, 1] to avoid NaN from floating point errors
        const clampedA = Math.max(0, Math.min(1, a));
        const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

        return R * c;
    }

    /**
     * Get a hold short node for a runway.
     * This finds the nearest graph node to the runway threshold (start position)
     * that is NOT on the runway itself (i.e., slightly offset for hold short).
     */
    public getHoldShortNodeForRunway(runwayId: string): string | null {
        // Runway hold short areas - specific taxiway nodes near runway thresholds
        // These are the exact intersection points of taxiways with runway hold short lines
        // Based on runway geometry from RunwayManager:
        //   16L/34R (East): Start 38.7291,-77.5218 → End 38.7126,-77.5074
        //   16R/34L (West): Start 38.7277,-77.5235 → End 38.7152,-77.5126
        const holdShortAreas: Record<string, { lat: number; lon: number; searchRadius: number }> = {
            // 16L - north end of EAST runway, near taxiway A intersection
            '16L': { lat: 38.7277, lon: -77.5185, searchRadius: 100 },
            // 34R - south end of EAST runway, B6 taxiway intersection (from graph: -77.507405,38.713260)
            '34R': { lat: 38.7133, lon: -77.5074, searchRadius: 200 },
            // 16R - north end of WEST runway, at A1 (BEFORE the runway, not on it)
            '16R': { lat: 38.7268, lon: -77.5215, searchRadius: 80 },
            // 34L - south end of WEST runway (near where taxiway meets runway south end)
            '34L': { lat: 38.7152, lon: -77.5126, searchRadius: 200 }
        };

        const holdArea = holdShortAreas[runwayId];
        if (!holdArea) {
            console.warn(`[GraphManager] Unknown runway: ${runwayId}`);
            return null;
        }

        // Find the closest node within the search radius
        let bestNode: string | null = null;
        let bestDist = Infinity;

        for (const node of this.nodes.values()) {
            const dist = this.haversine(holdArea.lat, holdArea.lon, node.lat, node.lon);
            if (dist < holdArea.searchRadius && dist < bestDist) {
                bestDist = dist;
                bestNode = node.id;
            }
        }

        if (bestNode) {
            const node = this.nodes.get(bestNode);
            console.log(`[GraphManager] Hold short for ${runwayId}: ${bestNode} (${bestDist.toFixed(1)}m away) at ${node?.lat}, ${node?.lon}`);
        } else {
            console.warn(`[GraphManager] No hold short node found for ${runwayId} within ${holdArea.searchRadius}m`);
        }

        return bestNode;
    }

    /**
     * Get the runway entry node for line up and wait.
     * This is a node ON the runway where the aircraft positions for takeoff.
     */
    public getRunwayEntryNode(runwayId: string): string | null {
        // Runway entry points - position on the runway near the threshold
        // where aircraft line up before takeoff
        // These should be ON the runway, just past the hold short line
        // Using actual runway node coordinates from graph.json:
        //   16L/34R (East) runway nodes run from 38.7129 to 38.7288
        //   16R/34L (West) runway nodes run from ~38.7178 to 38.7266
        const runwayEntryPoints: Record<string, { lat: number; lon: number; searchRadius: number }> = {
            // 16L entry - north end of EAST runway threshold
            '16L': { lat: 38.7285, lon: -77.5210, searchRadius: 100 },
            // 34R entry - south end of EAST runway (graph node: -77.508112,38.712879)
            '34R': { lat: 38.7129, lon: -77.5081, searchRadius: 200 },
            // 16R entry - north end of WEST runway (graph node: -77.521016,38.726647)
            '16R': { lat: 38.7266, lon: -77.5210, searchRadius: 100 },
            // 34L entry - south end of WEST runway (near geometry end: 38.7152,-77.5126)
            '34L': { lat: 38.7152, lon: -77.5126, searchRadius: 200 }
        };

        const entryPoint = runwayEntryPoints[runwayId];
        if (!entryPoint) {
            console.warn(`[GraphManager] Unknown runway for entry: ${runwayId}`);
            return null;
        }

        // Find the closest node within the search radius
        let bestNode: string | null = null;
        let bestDist = Infinity;

        for (const node of this.nodes.values()) {
            const dist = this.haversine(entryPoint.lat, entryPoint.lon, node.lat, node.lon);
            if (dist < entryPoint.searchRadius && dist < bestDist) {
                bestDist = dist;
                bestNode = node.id;
            }
        }

        if (bestNode) {
            const node = this.nodes.get(bestNode);
            console.log(`[GraphManager] Runway entry for ${runwayId}: ${bestNode} (${bestDist.toFixed(1)}m away) at ${node?.lat}, ${node?.lon}`);
        } else {
            console.warn(`[GraphManager] No runway entry node found for ${runwayId} within ${entryPoint.searchRadius}m`);
        }

        return bestNode;
    }
}
