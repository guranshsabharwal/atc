"use client";

import { useState } from "react";
import { WorldState, Aircraft } from "@atc/shared";
import { Button } from "@/components/ui/button";

interface SimControllerProps {
    connected: boolean;
    worldState: WorldState | null;
    onSpawn: (callsign: string) => void;
    onTaxiTest?: (aircraftId: string) => void;
}

export default function SimController({ connected, worldState, onSpawn, onTaxiTest }: SimControllerProps) {
    const [callsign, setCallsign] = useState("UAL123");

    const handleSpawn = () => {
        onSpawn(callsign);
        // Randomize next callsign
        setCallsign(`UAL${Math.floor(Math.random() * 900) + 100}`);
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                <h2 className="text-lg font-semibold">System Status</h2>
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
                    <span className="text-sm font-medium">{connected ? "Connected" : "Disconnected"}</span>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                    <h3 className="mb-4 text-lg font-semibold">Commands</h3>
                    <div className="flex gap-4 items-end">
                        <div className="grid gap-2">
                            <label className="text-sm font-medium leading-none">Callsign</label>
                            <input
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={callsign}
                                onChange={(e) => setCallsign(e.target.value)}
                            />
                        </div>
                        <Button onClick={handleSpawn} disabled={!connected}>
                            Spawn Aircraft
                        </Button>
                    </div>
                </div>

                <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                    <h3 className="mb-4 text-lg font-semibold">World State</h3>
                    <div className="text-sm text-muted-foreground mb-2">
                        Timestamp: {worldState?.timestamp || 0}
                    </div>
                    <div className="space-y-2">
                        {(!worldState?.aircraft || worldState?.aircraft.length === 0) && <p className="text-sm">No aircraft in simulation.</p>}
                        {worldState?.aircraft?.map((ac: Aircraft) => (
                            <div key={ac.id} className="flex justify-between items-center p-2 border rounded bg-muted/50">
                                <span className="font-mono font-bold">{ac.callsign}</span>
                                <span className="text-xs">
                                    {ac.position.lat.toFixed(4)}, {ac.position.lon.toFixed(4)} • {ac.position.alt}ft
                                </span>
                                <Button size="sm" variant="outline" onClick={() => onTaxiTest && onTaxiTest(ac.id)}>
                                    Taxi Test
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
