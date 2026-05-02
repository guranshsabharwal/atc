"use client";

import { WorldState, OperatingMode, KHEF_DEMO_SCENARIO, KHEF_RUNWAY_CONFIGS } from "@atc/shared";
import { Button } from "@/components/ui/button";

interface DemoControlsProps {
    worldState: WorldState | null;
    onSetMode: (mode: OperatingMode) => void;
    onStart: () => void;
    onReset: () => void;
    onToggleAdvanced: () => void;
    advancedOpen: boolean;
}

const SCENARIO_TOTAL = KHEF_DEMO_SCENARIO.length;

function formatElapsed(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function DemoControls({
    worldState,
    onSetMode,
    onStart,
    onReset,
    onToggleAdvanced,
    advancedOpen,
}: DemoControlsProps) {
    const mode: OperatingMode = worldState?.mode ?? "AI";
    const metrics = worldState?.metrics;
    const running = !!worldState?.scenarioRunning;
    const completed = !!metrics?.completedAt;

    const elapsedMs = (() => {
        if (!metrics?.startedAt) return 0;
        const end = metrics.completedAt ?? worldState?.timestamp ?? Date.now();
        return end - metrics.startedAt;
    })();

    const departed = metrics?.departed ?? 0;
    const nearMisses = metrics?.nearMisses ?? 0;
    const avgTaxi = (() => {
        if (!metrics) return 0;
        const completedRuns = metrics.departed;
        if (completedRuns === 0) return 0;
        return metrics.totalTaxiSeconds / completedRuns;
    })();
    const config = worldState?.activeConfig ?? "16";
    const configLabel = KHEF_RUNWAY_CONFIGS[config]?.label ?? "South flow (16)";
    const activeRunways = KHEF_RUNWAY_CONFIGS[config]?.active.join(" / ") ?? "16L / 16R";

    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-3 pointer-events-none">
            {/* Mode toggle + actions */}
            <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-card/95 backdrop-blur shadow-2xl border px-3 py-2">
                <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
                    <Button
                        size="lg"
                        variant={mode === "HUMAN" ? "default" : "ghost"}
                        className={`text-base font-bold w-28 ${mode === "HUMAN" ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}`}
                        disabled={running}
                        onClick={() => onSetMode("HUMAN")}
                        title="Operator picks each runway. No collision avoidance."
                    >
                        HUMAN
                    </Button>
                    <Button
                        size="lg"
                        variant={mode === "AI" ? "default" : "ghost"}
                        className={`text-base font-bold w-28 ${mode === "AI" ? "bg-emerald-500 hover:bg-emerald-600 text-white" : ""}`}
                        disabled={running}
                        onClick={() => onSetMode("AI")}
                        title="A* pathfinding, auto sequencing, proactive 50 m reroute."
                    >
                        AI
                    </Button>
                </div>

                <div className="h-8 w-px bg-border" />

                <Button
                    size="lg"
                    className="font-bold text-base px-6"
                    disabled={running}
                    onClick={onStart}
                >
                    {completed ? "Run Again" : "Start Demo"}
                </Button>
                <Button
                    size="lg"
                    variant="outline"
                    className="font-bold text-base"
                    onClick={onReset}
                >
                    Reset
                </Button>

                <div className="h-8 w-px bg-border" />

                <Button
                    size="sm"
                    variant={advancedOpen ? "secondary" : "ghost"}
                    className="text-xs"
                    onClick={onToggleAdvanced}
                    title="Show the full controller sidebar (developer mode)."
                >
                    Advanced
                </Button>
            </div>

            {/* KPI strip */}
            <div className="pointer-events-auto flex items-stretch gap-2 rounded-2xl bg-card/95 backdrop-blur shadow-xl border px-2 py-2">
                <Kpi label="Mode" value={mode} accent={mode === "AI" ? "emerald" : "amber"} />
                <Kpi label="Wind" value={configLabel} sub={`Active: ${activeRunways}`} />
                <Kpi label="Time" value={formatElapsed(elapsedMs)} mono />
                <Kpi
                    label="Departed"
                    value={`${departed} / ${SCENARIO_TOTAL}`}
                    accent={departed === SCENARIO_TOTAL && SCENARIO_TOTAL > 0 ? "emerald" : undefined}
                    mono
                />
                <Kpi
                    label="Near-misses"
                    value={nearMisses.toString()}
                    accent={nearMisses === 0 ? "emerald" : "red"}
                    mono
                />
                <Kpi
                    label="Avg taxi"
                    value={avgTaxi > 0 ? `${avgTaxi.toFixed(1)}s` : "—"}
                    mono
                />
            </div>

            {/* Hint banner */}
            {running && mode === "HUMAN" && !completed && (
                <div className="pointer-events-auto rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 px-4 py-2 text-sm text-amber-900 dark:text-amber-200 shadow">
                    Click each aircraft on the map and pick a runway from the popup.
                </div>
            )}
            {running && mode === "AI" && !completed && (
                <div className="pointer-events-auto rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 px-4 py-2 text-sm text-emerald-900 dark:text-emerald-200 shadow">
                    AI is taxiing all aircraft and rerouting around conflicts.
                </div>
            )}

            {/* End-of-run summary */}
            {completed && metrics && (
                <div className="pointer-events-auto rounded-2xl bg-card/95 backdrop-blur shadow-2xl border px-6 py-4 text-center min-w-[320px]">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Run complete</div>
                    <div className={`text-3xl font-bold ${mode === "AI" ? "text-emerald-600" : "text-amber-600"}`}>{mode}</div>
                    <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                        <SummaryRow label="Time" value={formatElapsed(elapsedMs)} />
                        <SummaryRow label="Departed" value={`${metrics.departed}/${metrics.spawned}`} />
                        <SummaryRow label="Near-misses" value={metrics.nearMisses.toString()} />
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                        Reset and switch modes to compare.
                    </div>
                </div>
            )}
        </div>
    );
}

function Kpi({
    label,
    value,
    sub,
    mono,
    accent,
}: {
    label: string;
    value: string;
    sub?: string;
    mono?: boolean;
    accent?: "emerald" | "amber" | "red";
}) {
    const accentClass =
        accent === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
            accent === "amber" ? "text-amber-600 dark:text-amber-400" :
                accent === "red" ? "text-red-600 dark:text-red-400" :
                    "text-foreground";
    return (
        <div className="px-3 py-1 rounded-xl bg-muted/40 min-w-[80px] text-center">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
            <div className={`text-base font-bold ${accentClass} ${mono ? "font-mono" : ""}`}>{value}</div>
            {sub && <div className="text-[10px] text-muted-foreground font-mono">{sub}</div>}
        </div>
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
            <div className="text-lg font-bold font-mono">{value}</div>
        </div>
    );
}
