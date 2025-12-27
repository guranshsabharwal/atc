import SimController from "@/components/SimController";

export default function Home() {
    return (
        <main className="min-h-screen bg-background p-8">
            <div className="max-w-5xl mx-auto space-y-8">
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight">ATC Training Simulation</h1>
                    <p className="text-muted-foreground">Monitor and control the simulation environment.</p>
                </div>

                <SimController />
            </div>
        </main>
    );
}
