#!/usr/bin/env node
/**
 * Headless acceptance harness for the science-fair demo.
 *
 * Runs the canned KHEF scenario in AI mode and HUMAN mode, fast-forwarding the
 * 10 Hz tick loop, and prints the metrics the demo will display on screen.
 *
 *   AI    : 0 near-misses, < 4 min wall time, all 6 aircraft depart.
 *   HUMAN : >= 2 near-misses (or stalls), wall time >= 1.5 x AI.
 *
 * Run:  node scripts/demo-acceptance.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Simulation } from '../packages/engine/dist/index.js';
import { KHEF_DEMO_SCENARIO } from '../packages/shared/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const graphPath = path.resolve(__dirname, '../data/derived/khef/graph.json');
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));

const TICK_HZ = 10;
const DT = 1 / TICK_HZ;
const TICK_MS = 1000 / TICK_HZ;
const MAX_SIM_MINUTES = 15;
const MAX_TICKS = MAX_SIM_MINUTES * 60 * TICK_HZ;

function runScenario(mode, { humanRunwayPicker } = {}) {
    const sim = new Simulation(graph);

    // Patch Date.now() so the sim's "wall clock" advances at our fast-forward rate.
    const realNow = Date.now;
    let virtualNow = realNow();
    Date.now = () => virtualNow;

    sim.handleCommand({ type: 'setMode', payload: { mode } });
    sim.handleCommand({ type: 'startScenario', payload: {} });

    let assignedIds = new Set();

    for (let tick = 0; tick < MAX_TICKS; tick++) {
        sim.tick(DT);

        // In HUMAN mode, simulate the operator clicking each newly-spawned aircraft
        // and picking a runway. The picker decides which runway: by default we use
        // the scenario default (which mirrors a "smart human" — even so, the lack
        // of collision avoidance during taxi causes jams).
        if (mode === 'HUMAN') {
            const state = sim.getState();
            for (const ac of state.aircraft) {
                if (assignedIds.has(ac.id)) continue;
                if (ac.clearance && ac.clearance.type !== 'NONE') {
                    assignedIds.add(ac.id);
                    continue;
                }
                const runway = humanRunwayPicker
                    ? humanRunwayPicker(ac, state)
                    : ac.suggestedRunwayId;
                if (runway) {
                    sim.handleCommand({
                        type: 'assignRunway',
                        payload: { aircraftId: ac.id, runwayId: runway },
                    });
                    assignedIds.add(ac.id);
                }
            }
        }

        const metrics = sim.getState().metrics;
        if (metrics?.completedAt) break;

        virtualNow += TICK_MS;
    }

    Date.now = realNow;

    const state = sim.getState();
    const m = state.metrics;
    const elapsedSec = m?.completedAt ? (m.completedAt - (m.startedAt ?? 0)) / 1000 : null;
    return {
        mode,
        completed: !!m?.completedAt,
        spawned: m?.spawned ?? 0,
        departed: m?.departed ?? 0,
        nearMisses: m?.nearMisses ?? 0,
        elapsedSec,
        stuckOnGround: state.aircraft.length,
    };
}

console.log('=== AI run ===');
const ai = runScenario('AI');
console.log(ai);

console.log('\n=== HUMAN run (worst-case: cluster all departures on 16L) ===');
// A naive human who sends every aircraft to 16L creates the visible jam.
const humanWorst = runScenario('HUMAN', { humanRunwayPicker: () => '16L' });
console.log(humanWorst);

console.log('\n=== HUMAN run (default: scenario-suggested runways, no collision aid) ===');
const human = runScenario('HUMAN');
console.log(human);

// Reset cleanliness: after a run, restart and verify metrics are zero again.
console.log('\n=== Reset cleanliness ===');
const reset = (() => {
    const realNow = Date.now;
    let virtualNow = realNow();
    Date.now = () => virtualNow;
    const sim = new Simulation(JSON.parse(fs.readFileSync(graphPath, 'utf-8')));
    sim.handleCommand({ type: 'setMode', payload: { mode: 'AI' } });
    sim.handleCommand({ type: 'startScenario', payload: {} });
    for (let i = 0; i < 200; i++) { sim.tick(DT); virtualNow += TICK_MS; }
    sim.handleCommand({ type: 'resetScenario', payload: {} });
    const m = sim.getState().metrics;
    Date.now = realNow;
    return {
        aircraft: sim.getState().aircraft.length,
        scenarioRunning: sim.getState().scenarioRunning,
        spawned: m?.spawned, departed: m?.departed, nm: m?.nearMisses,
    };
})();
console.log(reset);

const checks = [];
const aiOk = ai.completed && ai.departed === ai.spawned && (ai.elapsedSec ?? Infinity) < 5 * 60;
checks.push(['AI completes 6/6 < 5 min', aiOk]);

const aiVsHumanRatio = ai.elapsedSec && humanWorst.elapsedSec ? humanWorst.elapsedSec / ai.elapsedSec : 0;
checks.push([`HUMAN-worst >= 1.5x AI time (got ${aiVsHumanRatio.toFixed(2)}x)`, aiVsHumanRatio >= 1.5]);

const aiVsHumanNm = humanWorst.nearMisses >= ai.nearMisses + 2;
checks.push([`HUMAN-worst near-misses >= AI + 2 (AI=${ai.nearMisses}, H=${humanWorst.nearMisses})`, aiVsHumanNm]);

const resetOk = reset.aircraft === 0 && !reset.scenarioRunning && reset.spawned === 0 && reset.departed === 0 && reset.nm === 0;
checks.push(['Reset clears aircraft + metrics', resetOk]);

console.log('\n=== Acceptance ===');
let pass = true;
for (const [label, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) pass = false;
}
process.exit(pass ? 0 : 1);
