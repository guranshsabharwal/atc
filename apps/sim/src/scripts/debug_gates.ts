
import fs from 'fs';
import path from 'path';
import { GraphManager, RunwayManager, GroundGraph } from '@atc/engine';
import { KHEF_GATES } from '@atc/shared';

const graphPath = path.resolve(__dirname, '../../../../data/derived/khef/graph.json');
const graphData: GroundGraph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));

const graph = new GraphManager(graphData);
const runwayManager = new RunwayManager();

console.log('--- Checking Gate Connectivity ---');
KHEF_GATES.forEach(gate => {
    const nodeId = graph.findNearestNode(gate.lat, gate.lon);
    if (!nodeId) {
        console.log(`[FAIL] Gate ${gate.id}: No nearest node found.`);
        return;
    }
    const node = graph.getNode(nodeId);
    // dist in meters approx
    const dist = haversine(gate.lat, gate.lon, node!.lat, node!.lon);

    const reachable = graph.getReachableNodes(nodeId);

    console.log(`Gate ${gate.id} -> Node ${nodeId} (${Math.round(dist)}m away). Reachable Nodes: ${reachable.length}`);

    if (reachable.length < 10) {
        console.warn(`[WARN] Gate ${gate.id} seems isolated!`);
    }
});

console.log('\n--- Checking Runway Proximity (False Alerts) ---');
// Mock aircraft at gate
KHEF_GATES.forEach(gate => {
    const alerts = runwayManager.checkForIncursions([{
        id: 'test',
        callsign: 'TEST',
        position: { lat: gate.lat, lon: gate.lon, alt: 0, heading: 0 },
        speed: 0
    }]);

    if (alerts.length > 0) {
        console.error(`[ALERT] Gate ${gate.id} triggers runway incursion!`);
    } else {
        console.log(`[OK] Gate ${gate.id} is clear of runways.`);
    }
});

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
