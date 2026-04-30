import { useEffect, useRef, useState, useCallback } from 'react';
import { WorldState } from '@atc/shared';
import { Simulation, GroundGraph } from '@atc/engine';

type SimStatus = 'loading' | 'ready' | 'error';

export function useSimulation() {
    const [status, setStatus] = useState<SimStatus>('loading');
    const [worldState, setWorldState] = useState<WorldState>({ aircraft: [], runways: [], timestamp: 0 });
    const simRef = useRef<Simulation | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const graphDataRef = useRef<GroundGraph | null>(null);

    const startTickLoop = useCallback((sim: Simulation) => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        const TICK_RATE = 100;
        intervalRef.current = setInterval(() => {
            sim.tick(TICK_RATE / 1000);
            setWorldState({ ...sim.getState() });
        }, TICK_RATE);
    }, []);

    const initSim = useCallback(async () => {
        setStatus('loading');
        try {
            let graphData = graphDataRef.current;
            if (!graphData) {
                const res = await fetch('/data/graph.json');
                if (!res.ok) throw new Error(`Failed to fetch graph.json: ${res.status}`);
                graphData = await res.json() as GroundGraph;
                graphDataRef.current = graphData;
            }

            if (intervalRef.current) clearInterval(intervalRef.current);

            const sim = new Simulation(graphData);
            simRef.current = sim;
            setWorldState({ ...sim.getState() });
            startTickLoop(sim);
            setStatus('ready');
        } catch (e) {
            console.error('[useSimulation] Failed to initialize simulation:', e);
            setStatus('error');
        }
    }, [startTickLoop]);

    useEffect(() => {
        initSim();
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [initSim]);

    const sendCommand = useCallback((type: string, payload: unknown) => {
        if (!simRef.current) {
            console.warn('[useSimulation] Simulation not ready, dropping command:', type);
            return;
        }
        simRef.current.handleCommand({ type, payload } as Parameters<Simulation['handleCommand']>[0]);
    }, []);

    const reset = useCallback(() => {
        initSim();
    }, [initSim]);

    return {
        isConnected: status === 'ready',
        isLoading: status === 'loading',
        worldState,
        sendCommand,
        reset,
    };
}
