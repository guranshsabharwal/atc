import { WorldState, Command, Aircraft } from '@atc/shared';

export function handleCommand(state: WorldState, command: Command): WorldState {
    switch (command.type) {
        case 'spawnAircraft':
            const newAircraft: Aircraft = {
                id: Math.random().toString(36).substring(7),
                callsign: command.payload.callsign,
                position: command.payload.startPosition,
                speed: 0, // Initial speed
            };
            return {
                ...state,
                aircraft: [...state.aircraft, newAircraft],
            };
        default:
            return state;
    }
}
