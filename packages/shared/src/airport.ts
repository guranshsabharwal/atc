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
