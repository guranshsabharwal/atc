"use client";

import { useState, useCallback } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import SimController from "@/components/SimController";
import AirportMap from "@/components/AirportMap";
import RadarScope from "@/components/RadarScope";
import { useSimulation } from "@/hooks/useSimulation";
import { Button } from "@/components/ui/button";
import { ControllerPosition } from "@atc/shared";

export default function Home() {
    const { isConnected, worldState, sendCommand } = useSimulation();
    const [scopeMode, setScopeMode] = useState<'ground' | 'radar'>('ground');
    const [resizeKey, setResizeKey] = useState(0);

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

    // Phase 6: Air navigation command handlers
    const handleVector = (aircraftId: string, heading: number) => {
        sendCommand('vector', { aircraftId, heading });
    };

    const handleAltitude = (aircraftId: string, altitude: number, isClimb: boolean) => {
        sendCommand('altitude', { aircraftId, altitude, isClimb });
    };

    const handleSpeed = (aircraftId: string, speed: number) => {
        sendCommand('speed', { aircraftId, speed });
    };

    const handleHandoff = (aircraftId: string, toController: ControllerPosition) => {
        sendCommand('handoff', { aircraftId, toController });
    };

    // Trigger resize when panels change
    const handlePanelResize = useCallback(() => {
        setResizeKey(k => k + 1);
        // Dispatch resize event for maps to pick up
        window.dispatchEvent(new Event('resize'));
    }, []);

    return (
        <main className="flex h-screen w-full overflow-hidden bg-background">
            <Group orientation="horizontal" onLayoutChange={handlePanelResize}>
                {/* Map Area */}
                <Panel defaultSize={70} minSize={5}>
                    <div className="relative w-full h-full bg-slate-50 dark:bg-slate-950">
                        {/* Scope Toggle */}
                        <div className="absolute top-4 right-4 z-20 flex gap-1 bg-card/90 rounded-lg p-1 shadow-lg">
                            <Button
                                size="sm"
                                variant={scopeMode === 'ground' ? 'default' : 'ghost'}
                                onClick={() => setScopeMode('ground')}
                            >
                                Ground
                            </Button>
                            <Button
                                size="sm"
                                variant={scopeMode === 'radar' ? 'default' : 'ghost'}
                                onClick={() => setScopeMode('radar')}
                            >
                                Radar
                            </Button>
                        </div>

                        <div className="absolute inset-0" key={`scope-${scopeMode}-${resizeKey}`}>
                            {scopeMode === 'ground' ? (
                                <AirportMap worldState={worldState} />
                            ) : (
                                <RadarScope worldState={worldState} />
                            )}
                        </div>
                    </div>
                </Panel>

                {/* Resize Handle */}
                <Separator className="w-1.5 bg-border hover:bg-primary/50 transition-colors cursor-col-resize" />

                {/* Sidebar */}
                <Panel defaultSize={30} minSize={5}>
                    <aside className="h-full flex flex-col overflow-y-auto bg-card shadow-xl">
                        <div className="p-4 border-b">
                            <h1 className="text-xl font-bold tracking-tight">KHEF Trainer</h1>
                            <p className="text-xs text-muted-foreground">Server Authoritative Sim</p>
                        </div>

                        <div className="p-4 flex-1 overflow-y-auto">
                            <SimController
                                connected={isConnected}
                                worldState={worldState}
                                onSpawn={handleSpawn}
                                onTaxi={(id, destRunway) => sendCommand('issueTaxiClearance', { aircraftId: id, destinationRunwayId: destRunway })}
                                onLineUp={(id, runwayId) => sendCommand('lineUpAndWait', { aircraftId: id, runwayId: runwayId })}
                                onTakeoff={(id, runwayId) => sendCommand('takeoffClearance', { aircraftId: id, runwayId: runwayId })}
                                onLanding={(id, runwayId) => sendCommand('landingClearance', { aircraftId: id, runwayId: runwayId })}
                                onDelete={(id) => sendCommand('deleteAircraft', { aircraftId: id })}
                                onVector={handleVector}
                                onAltitude={handleAltitude}
                                onSpeed={handleSpeed}
                                onHandoff={handleHandoff}
                            />
                        </div>
                    </aside>
                </Panel>
            </Group>
        </main>
    );
}
