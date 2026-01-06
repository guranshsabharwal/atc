import { describe, expect, test, beforeEach, vi } from 'vitest';
import { Simulation } from './Simulation';
import { SpawnAircraftCommand, IssueTaxiClearanceCommand } from '@atc/shared';

// Mock GraphManager to avoid file system dependencies during unit tests
vi.mock('./GraphManager', () => {
    return {
        GraphManager: class {
            loadGraph() { }
            findNearestNode(lat: number, lon: number) { return 'node1'; }
            getNode(id: string) { return { id, lat: 0, lon: 0 }; }
            getReachableNodes() { return ['node1', 'node2']; }
            findPath(start: string, end: string, options?: any) { return ['node1', 'node2']; }
            getHoldShortNodeForRunway(runwayId: string) { return 'node2'; }
            // Helper for simple bearing calc if needed, or mocked return
            haversine() { return 100; }
        }
    };
});

describe('Simulation Core', () => {
    let sim: Simulation;

    beforeEach(() => {
        sim = new Simulation();
    });

    test('initial state is empty', () => {
        const state = sim.getState();
        expect(state.aircraft).toEqual([]);
        expect(state.timestamp).toBeDefined();
    });

    test('spawnAircraft adds an aircraft', () => {
        const cmd: SpawnAircraftCommand = {
            type: 'spawnAircraft',
            payload: {
                callsign: 'TEST1',
                startPosition: { lat: 10, lon: 10, alt: 0, heading: 0 }
            }
        };

        sim.handleCommand(cmd);
        const state = sim.getState();

        expect(state.aircraft).toHaveLength(1);
        expect(state.aircraft[0].callsign).toBe('TEST1');
        // Position is kept as provided since we don't snap to graph during spawn
        expect(state.aircraft[0].position.lat).toBe(10);
    });

    test('issueTaxiClearance updates aircraft clearance and route', () => {
        // First spawn
        sim.handleCommand({
            type: 'spawnAircraft',
            payload: {
                callsign: 'TEST1',
                startPosition: { lat: 0, lon: 0, alt: 0, heading: 0 }
            }
        });

        const acId = sim.getState().aircraft[0].id;

        // Issue clearance - now uses destinationRunwayId instead of destinationNodeId
        const cmd: IssueTaxiClearanceCommand = {
            type: 'issueTaxiClearance',
            payload: {
                aircraftId: acId,
                destinationRunwayId: '16L'
            }
        };

        sim.handleCommand(cmd);
        const ac = sim.getState().aircraft[0];

        expect(ac.clearance?.type).toBe('TAXI');
        expect(ac.route).toEqual(['node1', 'node2']);
        expect(ac.speed).toBeGreaterThan(0);
    });

    test('tick updates timestamp', () => {
        const t1 = sim.getState().timestamp;
        // Wait a small amount to ensure time changes
        const start = Date.now();
        while (Date.now() - start < 2) { }

        sim.tick(0.1);
        const t2 = sim.getState().timestamp;

        expect(t2).toBeGreaterThan(t1);
    });
});
