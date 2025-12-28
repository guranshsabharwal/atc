"use client";

import SimController from "@/components/SimController";
import AirportMap from "@/components/AirportMap";
import { useSimulation } from "@/hooks/useSimulation";

export default function Home() {
    const { isConnected, worldState, sendCommand } = useSimulation();

    const handleSpawn = (callsign: string, gateId?: string) => {
        // Fallback random if no gate (though UI enforces gate)
        const lat = 38.7214 + (Math.random() - 0.5) * 0.01;
        const lon = -77.5154 + (Math.random() - 0.5) * 0.01;

        sendCommand("spawnAircraft", {
            callsign,
            // If gateId is present, the server uses it. 
            // If not, we provide a fallback position.
            startPosition: { lat, lon, alt: 300, heading: 90 },
            gateId: gateId
        });
    };

    return (
        <main className="flex h-screen w-full overflow-hidden bg-background">
            {/* Map Area */}
            <div className="flex-1 relative h-full bg-slate-50 dark:bg-slate-950">
                <div className="absolute inset-0">
                    <AirportMap worldState={worldState} />
                </div>
            </div>

            {/* Sidebar (Right) */}
            <aside className="w-80 flex-none border-l bg-card h-full flex flex-col overflow-y-auto z-10 shadow-xl">
                <div className="p-4 border-b">
                    <h1 className="text-xl font-bold tracking-tight">KHEF Trainer</h1>
                    <p className="text-xs text-muted-foreground">Server Authoritative Sim</p>
                </div>

                <div className="p-4 flex-1">
                    <SimController
                        connected={isConnected}
                        worldState={worldState}
                        onSpawn={handleSpawn}
                        onTaxi={(id, destRunway) => sendCommand('issueTaxiClearance', { aircraftId: id, destinationRunwayId: destRunway })}
                        onTakeoff={(id, runwayId) => sendCommand('takeoffClearance', { aircraftId: id, runwayId: runwayId })}
                        onLanding={(id, runwayId) => sendCommand('landingClearance', { aircraftId: id, runwayId: runwayId })}
                        onDelete={(id) => sendCommand('deleteAircraft', { aircraftId: id })}
                    />
                </div>
            </aside>
        </main>
    );
}
