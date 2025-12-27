import { z } from 'zod';

// Zod Schemas
export const PositionSchema = z.object({
    lat: z.number(),
    lon: z.number(),
    alt: z.number(), // feet
    heading: z.number(), // degrees
});

export const AircraftSchema = z.object({
    id: z.string(),
    callsign: z.string(),
    position: PositionSchema,
    speed: z.number(), // knots
});

export const WorldStateSchema = z.object({
    aircraft: z.array(AircraftSchema),
    timestamp: z.number(),
});

export const SpawnAircraftCommandSchema = z.object({
    type: z.literal('spawnAircraft'),
    payload: z.object({
        callsign: z.string(),
        startPosition: PositionSchema,
    }),
});

export const CommandSchema = z.discriminatedUnion('type', [
    SpawnAircraftCommandSchema,
]);

// TypeScript Types
export type Position = z.infer<typeof PositionSchema>;
export type Aircraft = z.infer<typeof AircraftSchema>;
export type WorldState = z.infer<typeof WorldStateSchema>;
export type SpawnAircraftCommand = z.infer<typeof SpawnAircraftCommandSchema>;
export type Command = z.infer<typeof CommandSchema>;
