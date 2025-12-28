import { describe, expect, test, beforeEach } from 'vitest';
import { RunwayManager } from './RunwayManager';

describe('RunwayManager', () => {
    let mgr: RunwayManager;

    beforeEach(() => {
        mgr = new RunwayManager();
    });

    test('initializes with KHEF runways as FREE', () => {
        const runways = mgr.getAllRunways();
        expect(runways).toHaveLength(4);
        expect(runways[0].status).toBe('FREE');
    });

    test('can occupy a runway', () => {
        const success = mgr.occupyRunway('16L', 'UAL123');
        expect(success).toBe(true);

        const rwy = mgr.getRunwayState('16L');
        expect(rwy?.status).toBe('OCCUPIED');
        expect(rwy?.occupiedBy).toBe('UAL123');
    });

    test('prevents double booking', () => {
        mgr.occupyRunway('16L', 'UAL123');

        // Try to occupy with a different aircraft
        const success = mgr.occupyRunway('16L', 'AAL456');
        expect(success).toBe(false);

        const rwy = mgr.getRunwayState('16L');
        expect(rwy?.occupiedBy).toBe('UAL123');
    });

    test('allows same aircraft to re-confirm occupancy', () => {
        mgr.occupyRunway('16L', 'UAL123');
        const success = mgr.occupyRunway('16L', 'UAL123');
        expect(success).toBe(true);
    });

    test('can release a runway', () => {
        mgr.occupyRunway('16L', 'UAL123');
        mgr.releaseRunway('16L');

        const rwy = mgr.getRunwayState('16L');
        expect(rwy?.status).toBe('FREE');
        expect(rwy?.occupiedBy).toBeUndefined();
    });
});
