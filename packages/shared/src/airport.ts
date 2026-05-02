import { z } from 'zod';

export const RunwaySchema = z.object({
    ident: z.string(),
    length_ft: z.number(),
    width_ft: z.number(),
    surface: z.string(),
    lighted: z.boolean(),
    closed: z.boolean(),
});

export const AirportSchema = z.object({
    id: z.string(), // e.g. "KHEF"
    name: z.string(),
    elevation_ft: z.number(),
    location: z.object({
        lat: z.number(),
        lon: z.number(),
    }),
    runways: z.array(RunwaySchema),
});


export const RunwayStatusSchema = z.enum(['FREE', 'OCCUPIED', 'CROSSING_ACTIVE']);

export const RunwayStateSchema = z.object({
    id: z.string(), // e.g. "16L"
    status: RunwayStatusSchema,
    occupiedBy: z.string().optional(), // Aircraft ID
    queue: z.array(z.string()), // List of Aircraft IDs waiting
});

export type Runway = z.infer<typeof RunwaySchema>;
export type Airport = z.infer<typeof AirportSchema>;
export type RunwayStatus = z.infer<typeof RunwayStatusSchema>;
export type RunwayState = z.infer<typeof RunwayStateSchema>;

export interface ParkingGate {
    id: string;
    lat: number;
    lon: number;
    heading: number; // Initial heading
}

export const KHEF_GATES: ParkingGate[] = [
    // Terminal Ramp (Main Terminal)
    // Moved to intersect Taxiway Z more cleanly
    { id: 'TERMINAL', lat: 38.7248, lon: -77.5122, heading: 270 },

    // APP Jet Center FBO
    { id: 'APP_JET', lat: 38.7272, lon: -77.5138, heading: 270 },

    // South Ramp (Piston 2 Jet Area)
    { id: 'SOUTH_RAMP', lat: 38.7205, lon: -77.5192, heading: 90 },

    // West Ramp (General Aviation)
    // Moved Northwest as requested (West of Taxiway A/A1 area)
    { id: 'WEST_RAMP', lat: 38.7235, lon: -77.5208, heading: 90 }
];

// Science fair demo scenario: 6 aircraft, fixed gates + suggested runways.
// Engineered so several routes overlap, making collisions likely without AI help.
export interface ScenarioAircraft {
    callsign: string;
    gateId: string;
    runwayId: string;       // Suggested takeoff runway (used by AI; default in Human mode)
    spawnDelaySec: number;  // Seconds after scenario start to spawn this aircraft
}

// Runway "side" — real airports run all departures off one side based on wind
// (e.g., south winds = 16-flow, north winds = 34-flow). The demo locks one side
// active so the AI never reroutes a departure to the opposite-direction runway.
export type RunwayConfig = '16' | '34';

export const KHEF_RUNWAY_CONFIGS: Record<RunwayConfig, { active: string[]; inactive: string[]; label: string }> = {
    '16': { active: ['16L', '16R'], inactive: ['34L', '34R'], label: 'South flow (16)' },
    '34': { active: ['34L', '34R'], inactive: ['16L', '16R'], label: 'North flow (34)' },
};

export const KHEF_DEMO_SCENARIO: ScenarioAircraft[] = [
    // All departures use the 16-side (south flow). Three aircraft per active runway,
    // engineered so several taxi paths overlap on the apron and main taxiway.
    { callsign: 'AAL101', gateId: 'TERMINAL',   runwayId: '16L', spawnDelaySec: 0 },
    { callsign: 'DAL202', gateId: 'APP_JET',    runwayId: '16L', spawnDelaySec: 1 },
    { callsign: 'UAL303', gateId: 'SOUTH_RAMP', runwayId: '16R', spawnDelaySec: 2 },
    { callsign: 'SWA404', gateId: 'WEST_RAMP',  runwayId: '16R', spawnDelaySec: 3 },
    { callsign: 'JBU505', gateId: 'TERMINAL',   runwayId: '16R', spawnDelaySec: 4 },
    { callsign: 'N123FX', gateId: 'APP_JET',    runwayId: '16L', spawnDelaySec: 5 },
];
