import { WorldState, Aircraft, Position, Command, SpawnAircraftCommand, IssueTaxiClearanceCommand } from '@atc/shared';

export class Simulation {
    private state: WorldState;

    constructor() {
        this.state = {
            aircraft: [],
            timestamp: Date.now(),
        };
    }

    public tick(dt: number) {
        this.state.timestamp = Date.now();

        // Update Physics
        this.state.aircraft = this.state.aircraft.map(ac => {
            if (ac.speed > 0) {
                return this.updatePhysics(ac, dt);
            }
            return ac;
        });
    }

    public getState(): WorldState {
        return this.state;
    }

    public handleCommand(command: Command) {
        switch (command.type) {
            case 'spawnAircraft':
                this.spawnAircraft(command);
                break;
            case 'issueTaxiClearance':
                this.issueTaxiClearance(command);
                break;
        }
    }

    private spawnAircraft(cmd: SpawnAircraftCommand) {
        const newAircraft: Aircraft = {
            id: Math.random().toString(36).substring(7),
            callsign: cmd.payload.callsign,
            position: cmd.payload.startPosition,
            speed: 0,
            clearance: { type: 'NONE' }
        };
        this.state.aircraft.push(newAircraft);
    }

    private issueTaxiClearance(cmd: IssueTaxiClearanceCommand) {
        const ac = this.state.aircraft.find(a => a.id === cmd.payload.aircraftId);
        if (!ac) return;

        // Placeholder: Set clearance (Pathfinding will be in Phase 4.3)
        // For now, we just acknowledge the command by setting a dummy speed to verify physics
        console.log(`[Sim] Clearance issued for ${ac.callsign} to ${cmd.payload.destinationNodeId}`);

        // DEBUG: Set speed to 5 knots just to see it move in Phase 4.2
        ac.speed = 10;
    }

    private updatePhysics(ac: Aircraft, dt: number): Aircraft {
        // Simple Lat/Lon update
        // 1 knot = 1.852 km/h
        // Earth Radius ~ 6371 km
        // 1 degree lat ~ 111 km
        const speedKmph = ac.speed * 1.852;
        const distKm = speedKmph * (dt / 3600); // distance in hours
        const distDeg = distKm / 111; // rough approx

        const radHeading = (ac.position.heading - 90) * (Math.PI / 180); // Math uses 0=East, Nav uses 0=North. 
        // Actually, let's stick to standard Navigation: 0=N, 90=E.
        // dx = speed * sin(heading)
        // dy = speed * cos(heading)
        const radNav = ac.position.heading * (Math.PI / 180);

        const dLat = distDeg * Math.cos(radNav);
        const dLon = distDeg * Math.sin(radNav) / Math.cos(ac.position.lat * (Math.PI / 180));

        return {
            ...ac,
            position: {
                ...ac.position,
                lat: ac.position.lat + dLat,
                lon: ac.position.lon + dLon
            }
        };
    }
}
