import { describe, expect, test } from 'vitest';
import { handleCommand } from './commands';
import { WorldState } from '@atc/shared';

describe('Command Handler', () => {
    test('spawnAircraft adds aircraft to state', () => {
        const initialState: WorldState = {
            aircraft: [],
            timestamp: Date.now(),
        };

        const command = {
            type: 'spawnAircraft' as const,
            payload: {
                callsign: 'TEST1',
                startPosition: { lat: 0, lon: 0, alt: 1000, heading: 0 },
            },
        };

        const newState = handleCommand(initialState, command);

        expect(newState.aircraft).toHaveLength(1);
        expect(newState.aircraft[0].callsign).toBe('TEST1');
        expect(newState.aircraft[0].position).toEqual(command.payload.startPosition);
    });
});
