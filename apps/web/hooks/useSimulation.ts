import { useEffect, useRef, useState, useCallback } from 'react';
import { WorldState, WorldStateSchema } from '@atc/shared';

export function useSimulation() {
    const [isConnected, setIsConnected] = useState(false);
    const [worldState, setWorldState] = useState<WorldState>({ aircraft: [], timestamp: 0 });
    const ws = useRef<WebSocket | null>(null);

    useEffect(() => {
        // Determine WS URL (assume localhost:3002 for now from previous SimController)
        const socket = new WebSocket('ws://localhost:3002');
        ws.current = socket;

        socket.onopen = () => setIsConnected(true);
        socket.onclose = () => setIsConnected(false);

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                // Server sends { type: 'state', payload: WorldState }
                if (data.type === 'state') {
                    const result = WorldStateSchema.safeParse(data.payload);
                    if (result.success) {
                        setWorldState(result.data);
                    } else {
                        console.warn('Invalid world state payload:', result.error);
                    }
                }
            } catch (e) {
                console.error('Failed to parse WS message', e);
            }
        };

        return () => {
            socket.close();
        };
    }, []);

    const sendCommand = useCallback((type: string, payload: any) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type, payload }));
        }
    }, []);

    return {
        isConnected,
        worldState,
        sendCommand
    };
}
