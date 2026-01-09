"use client";

import { useState } from "react";
import { WorldState, Aircraft, KHEF_GATES, ControllerPosition } from "@atc/shared";
import { Button } from "@/components/ui/button";

// KHEF Runways
const KHEF_RUNWAYS = ['16L', '34R', '16R', '34L'];

interface SimControllerProps {
    connected: boolean;
    worldState: WorldState | null;
    onSpawn: (callsign: string, gateId?: string) => void;
    onTaxi?: (aircraftId: string, destinationRunwayId: string) => void;
    onLineUp?: (aircraftId: string, runwayId: string) => void;
    onTakeoff?: (aircraftId: string, runwayId: string) => void;
    onLanding?: (aircraftId: string, runwayId: string) => void;
    onDelete?: (aircraftId: string) => void;
    // Phase 6: Air commands
    onVector?: (aircraftId: string, heading: number) => void;
    onAltitude?: (aircraftId: string, altitude: number, isClimb: boolean) => void;
    onSpeed?: (aircraftId: string, speed: number) => void;
    onHandoff?: (aircraftId: string, toController: ControllerPosition) => void;
}

export default function SimController({
    connected,
    worldState,
    onSpawn,
    onTaxi,
    onLineUp,
    onTakeoff,
    onLanding,
    onDelete,
    onVector,
    onAltitude,
    onSpeed,
    onHandoff
}: SimControllerProps) {
    const [callsign, setCallsign] = useState("UAL123");
    const [selectedGate, setSelectedGate] = useState(KHEF_GATES[0].id);
    const [taxiDestination, setTaxiDestination] = useState(KHEF_RUNWAYS[0]);
    const [vectorHeading, setVectorHeading] = useState(180);
    const [assignedAltitude, setAssignedAltitude] = useState(3000);

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
                        <label className="text-xs font-medium">Active Runways</label>
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] text-muted-foreground w-8">South:</span>
                                {['16L', '16R'].map(rwy => (
                                    <label key={rwy} className="flex items-center gap-1 text-xs cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedRunway.includes(rwy)}
                                            onChange={e => {
                                                if (e.target.checked) {
                                                    // Add runway, clear opposite direction
                                                    const cleared = selectedRunway.split(',').filter(r => r.startsWith('16') && r !== '');
                                                    setSelectedRunway([...cleared, rwy].join(','));
                                                } else {
                                                    // Remove runway
                                                    setSelectedRunway(selectedRunway.split(',').filter(r => r !== rwy).join(',') || '16L');
                                                }
                                            }}
                                            className="rounded w-3 h-3"
                                        />
                                        {rwy}
                                    </label>
                                ))}
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] text-muted-foreground w-8">North:</span>
                                {['34L', '34R'].map(rwy => (
                                    <label key={rwy} className="flex items-center gap-1 text-xs cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedRunway.includes(rwy)}
                                            onChange={e => {
                                                if (e.target.checked) {
                                                    // Add runway, clear opposite direction
                                                    const cleared = selectedRunway.split(',').filter(r => r.startsWith('34') && r !== '');
                                                    setSelectedRunway([...cleared, rwy].join(','));
                                                } else {
                                                    // Remove runway
                                                    setSelectedRunway(selectedRunway.split(',').filter(r => r !== rwy).join(',') || '16L');
                                                }
                                            }}
                                            className="rounded w-3 h-3"
                                        />
                                        {rwy}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">First selected runway used for Line Up/Takeoff</p>
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
                                    <select
                                        className="h-6 text-[10px] px-1 rounded border border-input bg-background"
                                        value={taxiDestination}
                                        onChange={e => setTaxiDestination(e.target.value)}
                                    >
                                        {KHEF_RUNWAYS.map(rwy => (
                                            <option key={rwy} value={rwy}>→ {rwy}</option>
                                        ))}
                                    </select>
                                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => onTaxi && onTaxi(ac.id, taxiDestination)}>
                                        Taxi
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        className="h-6 text-[10px] px-2"
                                        disabled={ac.clearance?.type !== 'HOLD'}
                                        onClick={() => onLineUp && onLineUp(ac.id, selectedRunway.split(',')[0])}
                                    >
                                        Line Up
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="default"
                                        className="h-6 text-[10px] px-2 bg-blue-600 hover:bg-blue-700 text-white"
                                        disabled={ac.clearance?.type !== 'LINEUP'}
                                        onClick={() => onTakeoff && onTakeoff(ac.id, selectedRunway.split(',')[0])}
                                    >
                                        Takeoff
                                    </Button>
                                    <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onDelete && onDelete(ac.id)}>
                                        ×
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

            {/* Phase 6: Air Traffic Control */}
            {worldState?.aircraft?.some(ac => ac.flightPhase && ac.flightPhase !== 'GROUND') && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-green-600 uppercase tracking-wider">Air Traffic</h3>

                    {/* Heading/Altitude Input */}
                    <div className="grid grid-cols-2 gap-2 p-2 bg-green-500/5 rounded-lg border border-green-500/20">
                        <div>
                            <label className="text-[10px] font-medium text-muted-foreground">Vector HDG</label>
                            <input
                                type="number"
                                className="flex h-7 w-full rounded border border-input bg-background px-2 text-xs"
                                value={vectorHeading}
                                onChange={e => setVectorHeading(parseInt(e.target.value) || 0)}
                                min={0}
                                max={360}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-medium text-muted-foreground">Altitude (ft)</label>
                            <input
                                type="number"
                                className="flex h-7 w-full rounded border border-input bg-background px-2 text-xs"
                                value={assignedAltitude}
                                onChange={e => setAssignedAltitude(parseInt(e.target.value) || 0)}
                                step={1000}
                            />
                        </div>
                    </div>

                    {/* Airborne Aircraft List */}
                    <div className="space-y-2">
                        {worldState.aircraft.filter(ac => ac.flightPhase && ac.flightPhase !== 'GROUND').map((ac: Aircraft) => (
                            <div key={ac.id} className="p-2 border border-green-500/30 rounded-lg bg-green-500/5">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-mono font-bold text-sm text-green-700 dark:text-green-400">{ac.callsign}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-700 dark:text-green-300 font-medium">
                                        {ac.controllerId || 'NONE'}
                                    </span>
                                </div>

                                {/* Flight info */}
                                <div className="text-[10px] text-muted-foreground font-mono flex gap-3 mb-2">
                                    <span>FL{Math.round(ac.position.alt / 100)}</span>
                                    <span>HDG {Math.round(ac.position.heading)}°</span>
                                    <span>{Math.round(ac.speed)}kts</span>
                                </div>

                                {/* Air Controls */}
                                <div className="flex flex-wrap gap-1">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 text-[10px] px-2"
                                        onClick={() => onVector && onVector(ac.id, vectorHeading)}
                                    >
                                        Vector {vectorHeading}°
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 text-[10px] px-2"
                                        onClick={() => onAltitude && onAltitude(ac.id, assignedAltitude, assignedAltitude > ac.position.alt)}
                                    >
                                        {assignedAltitude > ac.position.alt ? '↑' : '↓'} {assignedAltitude}
                                    </Button>

                                    {/* Handoff buttons */}
                                    {ac.controllerId !== 'APPROACH' && (
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="h-6 text-[10px] px-2"
                                            onClick={() => onHandoff && onHandoff(ac.id, 'APPROACH')}
                                        >
                                            → APP
                                        </Button>
                                    )}
                                    {ac.controllerId !== 'TOWER' && (
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="h-6 text-[10px] px-2"
                                            onClick={() => onHandoff && onHandoff(ac.id, 'TOWER')}
                                        >
                                            → TWR
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
