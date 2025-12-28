import { z } from 'zod';
import { RunwayStateSchema } from './airport';


// Zod Schemas
export const PositionSchema = z.object({
    lat: z.number(),
    lon: z.number(),
    alt: z.number(), // feet
    heading: z.number(), // degrees
});

// Clearance Types
export const ClearanceTypeSchema = z.enum(['NONE', 'TAXI', 'TAKEOFF', 'LAND', 'HOLD']);

export const TaxiClearanceSchema = z.object({
    type: z.literal('TAXI'),
    route: z.array(z.string()), // List of graph node IDs
    holdShort: z.string().optional(), // Node ID to hold short of
});

// Union for all clearance types (expand later)
export const ClearanceSchema = z.union([
    z.object({ type: z.literal('NONE') }),
    TaxiClearanceSchema,
    z.object({ type: z.literal('TAKEOFF') }), // Placeholder
    z.object({ type: z.literal('LAND') }), // Placeholder
    z.object({ type: z.literal('HOLD') }), // Placeholder
]);

export const AircraftSchema = z.object({
    id: z.string(),
    callsign: z.string(),
    position: PositionSchema,
    speed: z.number(), // knots
    // Phase 4.1 New Fields
    clearance: ClearanceSchema.optional(),
    route: z.array(z.string()).optional(), // The actual path the aircraft is following
    targetIndex: z.number().optional(), // Index in the route
});

export const WorldStateSchema = z.object({
    aircraft: z.array(AircraftSchema),
    runways: z.array(RunwayStateSchema).optional(), // Optional for backward compat during dev
    timestamp: z.number(),
});

export const SpawnAircraftCommandSchema = z.object({
    type: z.literal('spawnAircraft'),
    payload: z.object({
        callsign: z.string(),
        startPosition: PositionSchema,
    }),
});

export const IssueTaxiClearanceCommandSchema = z.object({
    type: z.literal('issueTaxiClearance'),
    payload: z.object({
        aircraftId: z.string(),
        destinationNodeId: z.string(),
    }),
});

export const CommandSchema = z.discriminatedUnion('type', [
    SpawnAircraftCommandSchema,
    IssueTaxiClearanceCommandSchema,
]);

// TypeScript Types
export * from './airport';
export type Position = z.infer<typeof PositionSchema>;
export type ClearanceType = z.infer<typeof ClearanceTypeSchema>;
export type Clearance = z.infer<typeof ClearanceSchema>;
export type TaxiClearance = z.infer<typeof TaxiClearanceSchema>;
export type Aircraft = z.infer<typeof AircraftSchema>;
export type WorldState = z.infer<typeof WorldStateSchema>;
export type SpawnAircraftCommand = z.infer<typeof SpawnAircraftCommandSchema>;
export type IssueTaxiClearanceCommand = z.infer<typeof IssueTaxiClearanceCommandSchema>;
export type Command = z.infer<typeof CommandSchema>;
