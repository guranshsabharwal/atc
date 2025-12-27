import Fastify from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import { WorldState, CommandSchema } from '@atc/shared';
import { handleCommand } from './commands';

const fastify = Fastify({ logger: true });

// Initial World State
let worldState: WorldState = {
    aircraft: [],
    timestamp: Date.now(),
};

// HTTP Route
fastify.get('/', async (request, reply) => {
    return { hello: 'world', aircraftCount: worldState.aircraft.length };
});

// Start Server
const start = async () => {
    try {
        await fastify.listen({ port: 3001, host: '0.0.0.0' });
        console.log(`HTTP server listening on 3001`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();

// WebSocket Server
const wss = new WebSocketServer({ port: 3002 });
console.log(`WebSocket server listening on 3002`);

const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.add(ws);

    // Send initial state
    ws.send(JSON.stringify({ type: 'state', payload: worldState }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            const result = CommandSchema.safeParse(data);

            if (result.success) {
                console.log('Received command:', result.data);
                const newState = handleCommand(worldState, result.data);
                worldState = newState;
                // Broadcast new state
                broadcastState();
            } else {
                console.warn('Invalid command:', result.error);
            }
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
    });
});

function broadcastState() {
    const message = JSON.stringify({ type: 'state', payload: worldState });
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

// Simple Tick Loop (updates timestamps for now)
setInterval(() => {
    worldState = { ...worldState, timestamp: Date.now() };
    broadcastState();
}, 1000); // 1Hz for now
