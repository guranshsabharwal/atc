"use client";

import { useState } from "react";
import { WorldState, Aircraft, KHEF_GATES } from "@atc/shared";
import { Button } from "@/components/ui/button";

interface SimControllerProps {
    connected: boolean;
    worldState: WorldState | null;
    onSpawn: (callsign: string, gateId?: string) => void;
    onTaxiTest?: (aircraftId: string) => void;
    onTakeoff?: (aircraftId: string, runwayId: string) => void;
}

export default function SimController({ connected, worldState, onSpawn, onTaxiTest, onTakeoff }: SimControllerProps) {
    const [callsign, setCallsign] = useState("UAL123");
    const [selectedGate, setSelectedGate] = useState(KHEF_GATES[0].id);

    const handleSpawn = () => {
        onSpawn(callsign, selectedGate);
        // Randomize next callsign
        setCallsign(`UAL${Math.floor(Math.random() * 900) + 100}`);
    };

    const [selectedRunway, setSelectedRunway] = useState("16L");

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

            {/* Alerts Panel */}
            {worldState?.alerts && worldState.alerts.length > 0 && (
                <div className="p-3 border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900/50 rounded-lg animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wide">System Alerts</span>
                    </div>
                    <ul className="text-xs text-red-600 dark:text-red-300 font-mono space-y-1">
                        {worldState.alerts.map((alert, i) => (
                            <li key={i}>• {alert}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Runways */}
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

            {/* Tower Control */}
            <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tower Control</h3>
                <div className="p-3 border rounded-lg bg-card space-y-3">
                    <div className="grid gap-1.5">
                        <label className="text-xs font-medium">Active Runway</label>
                        <select
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={selectedRunway}
                            onChange={e => setSelectedRunway(e.target.value)}
                        >
                            <option value="16L">16L</option>
                            <option value="34R">34R</option>
                            <option value="16R">16R</option>
                            <option value="34L">34L</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Traffic List */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Traffic</h3>
                    <span className="text-xs text-muted-foreground font-mono">{(worldState?.timestamp || 0).toString().slice(-6)}</span>
                </div>

                <div className="space-y-2">
                    <div className="grid gap-1.5 p-2 bg-muted/50 rounded-lg mb-4">
                        <div className="flex gap-2">
                            <select
                                className="flex h-8 w-24 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm"
                                value={selectedGate}
                                onChange={e => setSelectedGate(e.target.value)}
                            >
                                {KHEF_GATES.map(g => (
                                    <option key={g.id} value={g.id}>{g.id}</option>
                                ))}
                            </select>
                            <input
                                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm"
                                value={callsign}
                                onChange={(e) => setCallsign(e.target.value)}
                                placeholder="Callsign"
                            />
                            <Button size="sm" className="h-8 text-xs" onClick={handleSpawn} disabled={!connected}>
                                Spawn
                            </Button>
                        </div>
                    </div>

                    {(!worldState?.aircraft || worldState?.aircraft.length === 0) && (
                        <div className="text-xs text-muted-foreground p-4 text-center border rounded-lg border-dashed">
                            No active aircraft
                        </div>
                    )}
                    {worldState?.aircraft?.map((ac: Aircraft) => (
                        <div key={ac.id} className="p-3 border rounded-lg bg-background hover:bg-accent transition-all group">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-mono font-bold text-sm">{ac.callsign}</span>
                                <div className="flex gap-1">
                                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => onTaxiTest && onTaxiTest(ac.id)}>
                                        Taxi
                                    </Button>
                                    <Button size="sm" variant="default" className="h-6 text-[10px] px-2 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => onTakeoff && onTakeoff(ac.id, selectedRunway)}>
                                        Takeoff {selectedRunway}
                                    </Button>
                                </div>
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono flex justify-between">
                                <span>Alt: {ac.position.alt}ft</span>
                                <span>Spd: {ac.speed}kts</span>
                                <span className={ac.clearance?.type !== 'NONE' ? "text-primary font-bold" : ""}>{ac.clearance?.type || 'NONE'}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
