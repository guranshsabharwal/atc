import fs from 'fs';
import path from 'path';
import Fastify from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import { CommandSchema } from '@atc/shared';
import { Simulation, GroundGraph } from '@atc/engine';

const fastify = Fastify({ logger: true });

function loadGraphData(): GroundGraph {
    const graphPath = path.resolve(__dirname, '../../../data/derived/khef/graph.json');
    const rawData = fs.readFileSync(graphPath, 'utf-8');
    return JSON.parse(rawData) as GroundGraph;
}

const graphData = loadGraphData();
const sim = new Simulation(graphData);

// HTTP Route
fastify.get('/', async (request, reply) => {
    return { hello: 'world', aircraftCount: sim.getState().aircraft.length };
});

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

    ws.send(JSON.stringify({ type: 'state', payload: sim.getState() }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            const result = CommandSchema.safeParse(data);

            if (result.success) {
                console.log('Received command:', result.data);
                sim.handleCommand(result.data);
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
    const message = JSON.stringify({ type: 'state', payload: sim.getState() });
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

// Tick Loop (10 Hz = 100ms)
const TICK_RATE = 100;
setInterval(() => {
    sim.tick(TICK_RATE / 1000);
    broadcastState();
}, TICK_RATE);
