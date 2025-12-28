import { RunwayState, RunwayStatus } from '@atc/shared';

export class RunwayManager {
    private runways: Map<string, RunwayState> = new Map();

    constructor() {
        // Initialize dummy runways for KHEF
        // In a real scenario, this would come from a data source
        ['16L', '34R', '16R', '34L'].forEach(id => {
            this.runways.set(id, {
                id,
                status: 'FREE',
                queue: []
            });
        });
    }

    public getRunwayState(id: string): RunwayState | undefined {
        return this.runways.get(id);
    }

    public getAllRunways(): RunwayState[] {
        return Array.from(this.runways.values());
    }

    public setStatus(id: string, status: RunwayStatus, aircraftId?: string): boolean {
        const runway = this.runways.get(id);
        if (!runway) return false;

        // Basic conflict check
        if (status === 'OCCUPIED' && runway.status !== 'FREE' && runway.occupiedBy !== aircraftId) {
            console.warn(`[RunwayManager] Conflict: Cannot set ${id} to OCCUPIED by ${aircraftId} (curr: ${runway.status} by ${runway.occupiedBy})`);
            return false;
        }

        runway.status = status;
        if (status === 'FREE') {
            runway.occupiedBy = undefined;
        } else if (aircraftId) {
            runway.occupiedBy = aircraftId;
        }

        console.log(`[RunwayManager] Runway ${id} is now ${status} (Ac: ${aircraftId || 'None'})`);
        return true;
    }

    public occupyRunway(id: string, aircraftId: string): boolean {
        return this.setStatus(id, 'OCCUPIED', aircraftId);
    }

    public releaseRunway(id: string): boolean {
        return this.setStatus(id, 'FREE');
    }
}
