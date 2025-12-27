"use client";

import SimController from "@/components/SimController";
import AirportMap from "@/components/AirportMap";
import { useSimulation } from "@/hooks/useSimulation";

export default function Home() {
    const { isConnected, worldState, sendCommand } = useSimulation();

    const handleSpawn = (callsign: string) => {
        // Randomize start pos slightly to hit different graph nodes
        // KHEF Center approx 38.7214, -77.5154
        // Delta approx 0.005 deg (~500m)
        const lat = 38.7214 + (Math.random() - 0.5) * 0.01;
        const lon = -77.5154 + (Math.random() - 0.5) * 0.01;

        sendCommand("spawnAircraft", {
            callsign,
            startPosition: { lat, lon, alt: 300, heading: 90 },
        });
    };

    return (
        <main className="min-h-screen bg-background p-8">
            <div className="max-w-5xl mx-auto space-y-8">
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight">ATC Training Simulation</h1>
                    <p className="text-muted-foreground">Monitor and control the simulation environment.</p>
                </div>

                <AirportMap worldState={worldState} />

                <SimController
                    connected={isConnected}
                    worldState={worldState}
                    onSpawn={handleSpawn}
                    onTaxiTest={(id) => sendCommand('issueTaxiClearance', { aircraftId: id, destinationNodeId: 'test_node' })}
                />
            </div>
        </main>
    );
}
