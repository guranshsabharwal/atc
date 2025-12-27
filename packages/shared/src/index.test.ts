import { describe, expect, test } from 'vitest';
import { SpawnAircraftCommandSchema, WorldStateSchema } from './index';

describe('Shared Schemas', () => {
    test('validates spawnAircraft command', () => {
        const validCommand = {
            type: 'spawnAircraft',
            payload: {
                callsign: 'UAL123',
                startPosition: { lat: 40, lon: -74, alt: 3000, heading: 90 },
            },
        };
        expect(SpawnAircraftCommandSchema.safeParse(validCommand).success).toBe(true);
    });

    test('validates world state', () => {
        const state = {
            aircraft: [
                {
                    id: '1',
                    callsign: 'DAL456',
                    position: { lat: 33, lon: -84, alt: 5000, heading: 180 },
                    speed: 250,
                }
            ],
            timestamp: Date.now()
        };
        expect(WorldStateSchema.safeParse(state).success).toBe(true);
    });
});
