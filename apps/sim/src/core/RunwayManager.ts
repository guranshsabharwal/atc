import { RunwayState, RunwayStatus, Aircraft } from '@atc/shared';

// Helper to calculate distance from point to line segment (squared)
function distToSegmentSquared(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    const x = x1 + t * (x2 - x1);
    const y = y1 + t * (y2 - y1);
    return (px - x) * (px - x) + (py - y) * (py - y);
}

interface RunwayGeo {
    id: string;
    start: [number, number]; // lat, lon
    end: [number, number];
}

export class RunwayManager {
    private runways: Map<string, RunwayState>;
    private geometry: RunwayGeo[];

    constructor() {
        this.runways = new Map();
        this.geometry = [
            { id: '16L', start: [38.7291, -77.5218], end: [38.7126, -77.5074] },
            { id: '34R', start: [38.7126, -77.5074], end: [38.7291, -77.5218] }, // Same physical, reversed
            { id: '16R', start: [38.7277, -77.5235], end: [38.7152, -77.5126] },
            { id: '34L', start: [38.7152, -77.5126], end: [38.7277, -77.5235] }
        ];

        // Initialize KHEF runways
        this.geometry.forEach(geo => {
            if (!this.runways.has(geo.id)) {
                this.runways.set(geo.id, { id: geo.id, status: 'FREE', queue: [] });
            }
        });
    }

    public getRunwayState(id: string): RunwayState | undefined {
        return this.runways.get(id);
    }

    public getAllRunways(): RunwayState[] {
        return Array.from(this.runways.values());
    }

    public occupyRunway(id: string, aircraftId: string): boolean {
        // Reuse setStatus logic but with specific check
        return this.setStatus(id, 'OCCUPIED', aircraftId);
    }

    public setStatus(id: string, status: RunwayStatus, aircraftId?: string): boolean {
        const rwy = this.runways.get(id);
        if (!rwy) return false;

        // Basic conflict check
        if (status === 'OCCUPIED' && rwy.status !== 'FREE' && rwy.occupiedBy !== aircraftId) {
            console.warn(`[RunwayManager] Conflict: Cannot set ${id} to OCCUPIED by ${aircraftId} (curr: ${rwy.status} by ${rwy.occupiedBy})`);
            return false;
        }

        rwy.status = status;
        if (status === 'FREE') {
            rwy.occupiedBy = undefined;
        } else if (aircraftId) {
            rwy.occupiedBy = aircraftId;
        }

        console.log(`[RunwayManager] Runway ${id} is now ${status} (Ac: ${aircraftId || 'None'})`);
        return true;
    }

    public releaseRunway(id: string): boolean {
        return this.setStatus(id, 'FREE');
    }

    public checkForIncursions(aircraft: Aircraft[]): string[] {
        const alerts: string[] = [];
        const THRESHOLD_DEG2 = 0.0000005; // Approx 20-30 meters squared? Need to tune.
        // 0.00005 deg ~ 5m. Square is 0.0000000025.
        // Let's use a larger threshold for detection. 
        // 0.0002 deg ~ 20m. Square = 0.00000004.
        const THRESHOLD = 0.00000004;

        aircraft.forEach(ac => {
            this.geometry.forEach(geo => {
                const rwy = this.runways.get(geo.id);
                if (!rwy) return;

                const distSq = distToSegmentSquared(
                    ac.position.lat, ac.position.lon,
                    geo.start[0], geo.start[1],
                    geo.end[0], geo.end[1]
                );

                if (distSq < THRESHOLD) {
                    // Aircraft is ON this runway
                    // Incursion if:
                    // 1. Runway is FREE (Uncontrolled entry)
                    // 2. Runway is OCCUPIED by SOMEONE ELSE

                    // Case 1: FREE
                    if (rwy.status === 'FREE') {
                        // TODO: Check if they have clearance? For now, raw check.
                        // Ideally we check if ac.clearance matches.
                        alerts.push(`INCURSION! ${ac.callsign} entered active runway ${geo.id} without clearance!`);
                    }
                    // Case 2: OCCUPIED
                    else if (rwy.status === 'OCCUPIED' && rwy.occupiedBy !== ac.id) {
                        alerts.push(`CRITICAL! ${ac.callsign} incursed on ${geo.id} occupied by ${rwy.occupiedBy}!`);
                    }
                }
            });
        });
        return alerts;
    }
}
