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
        <div className="space-y-6">
            {/* Status Card */}
            <div className="flex items-center justify-between p-3 border rounded-lg bg-background/50 text-card-foreground shadow-sm">
                <span className="text-sm font-medium">System Status</span>
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
                    <span className="text-xs text-muted-foreground">{connected ? "Online" : "Offline"}</span>
                </div>
            </div>

            {/* Commands */}
            <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Commands</h3>
                <div className="space-y-2">
                    <div className="grid gap-1.5">
                        <label className="text-xs font-medium">Callsign</label>
                        <div className="flex gap-2">
                            <input
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                value={callsign}
                                onChange={(e) => setCallsign(e.target.value)}
                            />
                            <Button size="sm" onClick={handleSpawn} disabled={!connected}>
                                Spawn
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Runway Status */}
            <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Runways</h3>
                <div className="grid grid-cols-2 gap-2">
                    {worldState?.runways?.map((rwy: any) => (
                        <div key={rwy.id} className={`p-2 border rounded text-center transition-colors ${rwy.status === 'FREE' ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-300' : 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300'}`}>
                            <div className="font-bold text-sm">{rwy.id}</div>
                            <div className="text-[10px] font-medium uppercase tracking-wide opacity-80">{rwy.status}</div>
                            {rwy.occupiedBy && <div className="text-[10px] font-mono mt-1 pt-1 border-t border-dashed border-current/20">{rwy.occupiedBy}</div>}
                        </div>
                    ))}
                </div>
            </div>

            {/* Aircraft List */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Traffic</h3>
                    <span className="text-xs text-muted-foreground font-mono">{(worldState?.timestamp || 0).toString().slice(-6)}</span>
                </div>

                <div className="space-y-2">
                    {(!worldState?.aircraft || worldState?.aircraft.length === 0) && (
                        <div className="text-xs text-muted-foreground p-4 text-center border rounded-lg border-dashed">
                            No active aircraft
                        </div>
                    )}
                    {worldState?.aircraft?.map((ac: Aircraft) => (
                        <div key={ac.id} className="p-2 border rounded-lg bg-background/50 hover:bg-accent transition-colors group">
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-mono font-bold text-sm">{ac.callsign}</span>
                                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 opacity-0 group-hover:opacity-100" onClick={() => onTaxiTest && onTaxiTest(ac.id)}>
                                    Taxi
                                </Button>
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono grid grid-cols-2 gap-x-2">
                                <span>Alt: {ac.position.alt}ft</span>
                                <span>Spd: {ac.speed}kts</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
