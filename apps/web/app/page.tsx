"use client";

import { useCallback, useState } from "react";
import SimController from "@/components/SimController";
import AirportMap from "@/components/AirportMap";
import RadarScope from "@/components/RadarScope";
import DemoControls from "@/components/DemoControls";
import { useSimulation } from "@/hooks/useSimulation";
import { Button } from "@/components/ui/button";
import { ControllerPosition, OperatingMode } from "@atc/shared";

export default function Home() {
    const { isConnected, worldState, sendCommand, reset } = useSimulation();
    const [scopeMode, setScopeMode] = useState<"ground" | "radar">("ground");
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const handleSpawn = (callsign: string, gateId?: string) => {
        const lat = 38.7214 + (Math.random() - 0.5) * 0.01;
        const lon = -77.5154 + (Math.random() - 0.5) * 0.01;

        sendCommand("spawnAircraft", {
            callsign,
            startPosition: { lat, lon, alt: 300, heading: 90 },
            gateId,
        });
    };

    const handleVector = (aircraftId: string, heading: number) => sendCommand("vector", { aircraftId, heading });
    const handleAltitude = (aircraftId: string, altitude: number, isClimb: boolean) =>
        sendCommand("altitude", { aircraftId, altitude, isClimb });
    const handleSpeed = (aircraftId: string, speed: number) => sendCommand("speed", { aircraftId, speed });
    const handleHandoff = (aircraftId: string, toController: ControllerPosition) =>
        sendCommand("handoff", { aircraftId, toController });

    const handleSetMode = useCallback(
        (mode: OperatingMode) => sendCommand("setMode", { mode }),
        [sendCommand]
    );
    const handleStartScenario = useCallback(() => sendCommand("startScenario", {}), [sendCommand]);
    const handleResetScenario = useCallback(() => sendCommand("resetScenario", {}), [sendCommand]);
    const handleAssignRunway = useCallback(
        (aircraftId: string, runwayId: string) =>
            sendCommand("assignRunway", { aircraftId, runwayId }),
        [sendCommand]
    );
    const handleHoldAircraft = useCallback(
        (aircraftId: string, hold: boolean) =>
            sendCommand("holdAircraft", { aircraftId, hold }),
        [sendCommand]
    );

    return (
        <main className="relative h-screen w-full overflow-hidden bg-background">
            {/* Full-screen scope */}
            <div className="absolute inset-0">
                {scopeMode === "ground" ? (
                    <AirportMap
                        worldState={worldState}
                        showLayerToggles={advancedOpen}
                        onAssignRunway={handleAssignRunway}
                        onHoldAircraft={handleHoldAircraft}
                    />
                ) : (
                    <RadarScope worldState={worldState} />
                )}
            </div>

            {/* Demo overlay (centered top) */}
            <DemoControls
                worldState={worldState}
                onSetMode={handleSetMode}
                onStart={handleStartScenario}
                onReset={handleResetScenario}
                onToggleAdvanced={() => setAdvancedOpen(v => !v)}
                advancedOpen={advancedOpen}
            />

            {/* Title (corner) */}
            <div className="absolute top-4 left-4 z-20 rounded-xl bg-card/90 backdrop-blur shadow-lg border px-3 py-2">
                <h1 className="text-base font-bold tracking-tight">KHEF Taxi Demo</h1>
                <p className="text-[10px] text-muted-foreground">A* ground routing · 50 m reroute</p>
            </div>

            {/* Scope toggle (only visible in advanced) */}
            {advancedOpen && (
                <div className="absolute top-4 right-4 z-20 flex gap-1 bg-card/90 rounded-lg p-1 shadow-lg">
                    <Button size="sm" variant={scopeMode === "ground" ? "default" : "ghost"} onClick={() => setScopeMode("ground")}>
                        Ground
                    </Button>
                    <Button size="sm" variant={scopeMode === "radar" ? "default" : "ghost"} onClick={() => setScopeMode("radar")}>
                        Radar
                    </Button>
                </div>
            )}

            {/* Advanced sidebar */}
            {advancedOpen && (
                <aside className="absolute top-0 right-0 h-full w-[380px] z-20 bg-card shadow-2xl border-l overflow-y-auto">
                    <div className="p-4 border-b flex items-center justify-between">
                        <div>
                            <h2 className="text-sm font-bold tracking-tight">Advanced</h2>
                            <p className="text-[10px] text-muted-foreground">Full controller dev tools</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => setAdvancedOpen(false)}>
                            Close
                        </Button>
                    </div>
                    <div className="p-4">
                        <SimController
                            connected={isConnected}
                            worldState={worldState}
                            onSpawn={handleSpawn}
                            onTaxi={(id, destRunway) =>
                                sendCommand("issueTaxiClearance", { aircraftId: id, destinationRunwayId: destRunway })
                            }
                            onLineUp={(id, runwayId) => sendCommand("lineUpAndWait", { aircraftId: id, runwayId })}
                            onTakeoff={(id, runwayId) => sendCommand("takeoffClearance", { aircraftId: id, runwayId })}
                            onLanding={(id, runwayId) => sendCommand("landingClearance", { aircraftId: id, runwayId })}
                            onDelete={id => sendCommand("deleteAircraft", { aircraftId: id })}
                            onVector={handleVector}
                            onAltitude={handleAltitude}
                            onSpeed={handleSpeed}
                            onHandoff={handleHandoff}
                            onReset={reset}
                        />
                    </div>
                </aside>
            )}
        </main>
    );
}
