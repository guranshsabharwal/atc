import { z } from 'zod';
import { RunwayStateSchema } from './airport';


// Zod Schemas
export const PositionSchema = z.object({
    lat: z.number(),
    lon: z.number(),
    alt: z.number(), // feet
    heading: z.number(), // degrees
});

// Phase 6: Controller Positions
export const ControllerPositionSchema = z.enum(['GROUND', 'TOWER', 'APPROACH', 'DEPARTURE']);

// Phase 6: Flight Phases
export const FlightPhaseSchema = z.enum(['GROUND', 'DEPARTURE', 'CRUISE', 'APPROACH', 'LANDING']);

// Clearance Types (extended for Phase 6)
export const ClearanceTypeSchema = z.enum([
    'NONE', 'TAXI', 'TAKEOFF', 'LAND', 'HOLD', 'LINEUP', 'DEPARTED',
    'VECTOR', 'DIRECT_TO', 'CLIMB', 'DESCEND', 'SPEED' // Phase 6 additions
]);

export const TaxiClearanceSchema = z.object({
    type: z.literal('TAXI'),
    route: z.array(z.string()), // List of graph node IDs
    holdShort: z.string().optional(), // Node ID to hold short of
});

// Phase 6: Air navigation clearances
export const VectorClearanceSchema = z.object({
    type: z.literal('VECTOR'),
    heading: z.number(), // degrees magnetic
});

export const DirectToClearanceSchema = z.object({
    type: z.literal('DIRECT_TO'),
    fixId: z.string(),
    fixLat: z.number(),
    fixLon: z.number(),
});

export const ClimbClearanceSchema = z.object({
    type: z.literal('CLIMB'),
    altitude: z.number(), // feet MSL
});

export const DescendClearanceSchema = z.object({
    type: z.literal('DESCEND'),
    altitude: z.number(), // feet MSL
});

export const SpeedClearanceSchema = z.object({
    type: z.literal('SPEED'),
    speed: z.number(), // knots IAS
});

// Union for all clearance types
export const ClearanceSchema = z.union([
    z.object({ type: z.literal('NONE') }),
    TaxiClearanceSchema,
    z.object({ type: z.literal('TAKEOFF'), runwayId: z.string() }),
    z.object({ type: z.literal('LAND'), runwayId: z.string() }),
    z.object({ type: z.literal('HOLD') }), // Placeholder
    z.object({ type: z.literal('LINEUP'), runwayId: z.string() }), // Line up and wait on runway
    z.object({ type: z.literal('DEPARTED') }), // Aircraft has left the airspace
    // Phase 6: Air clearances
    VectorClearanceSchema,
    DirectToClearanceSchema,
    ClimbClearanceSchema,
    DescendClearanceSchema,
    SpeedClearanceSchema,
]);

export const AircraftSchema = z.object({
    id: z.string(),
    callsign: z.string(),
    position: PositionSchema,
    speed: z.number(), // knots
    // Phase 4.1 Fields
    clearance: ClearanceSchema.optional(),
    route: z.array(z.string()).optional(), // The actual path the aircraft is following (ground)
    targetIndex: z.number().optional(), // Index in the route
    // Phase 6: Air navigation fields
    targetAltitude: z.number().optional(),  // feet MSL
    targetHeading: z.number().optional(),   // degrees magnetic
    targetSpeed: z.number().optional(),     // knots IAS
    verticalRate: z.number().optional(),    // feet/min (+climb, -descent)
    controllerId: ControllerPositionSchema.optional(),
    flightPhase: FlightPhaseSchema.optional(),
});

export const WorldStateSchema = z.object({
    aircraft: z.array(AircraftSchema),
    runways: z.array(RunwayStateSchema).optional(), // Optional for backward compat during dev
    alerts: z.array(z.string()).optional(),
    timestamp: z.number(),
});

export const SpawnAircraftCommandSchema = z.object({
    type: z.literal('spawnAircraft'),
    payload: z.object({
        callsign: z.string(),
        startPosition: PositionSchema.optional(), // Legacy support or direct coord spawn
        gateId: z.string().optional(), // New preferred way
    }),
});

export const IssueTaxiClearanceCommandSchema = z.object({
    type: z.literal('issueTaxiClearance'),
    payload: z.object({
        aircraftId: z.string(),
        destinationRunwayId: z.string(), // Runway ID like "16L"
    }),
});

export const TakeoffClearanceCommandSchema = z.object({
    type: z.literal('takeoffClearance'),
    payload: z.object({
        aircraftId: z.string(),
        runwayId: z.string(),
    }),
});

export const LandingClearanceCommandSchema = z.object({
    type: z.literal('landingClearance'),
    payload: z.object({
        aircraftId: z.string(),
        runwayId: z.string(),
    }),
});

export const DeleteAircraftCommandSchema = z.object({
    type: z.literal('deleteAircraft'),
    payload: z.object({
        aircraftId: z.string(),
    }),
});

export const LineUpAndWaitCommandSchema = z.object({
    type: z.literal('lineUpAndWait'),
    payload: z.object({
        aircraftId: z.string(),
        runwayId: z.string(),
    }),
});

// Phase 6: Air navigation commands
export const VectorCommandSchema = z.object({
    type: z.literal('vector'),
    payload: z.object({
        aircraftId: z.string(),
        heading: z.number(), // degrees magnetic
    }),
});

export const DirectToCommandSchema = z.object({
    type: z.literal('directTo'),
    payload: z.object({
        aircraftId: z.string(),
        fixId: z.string(),
        fixLat: z.number(),
        fixLon: z.number(),
    }),
});

export const AltitudeCommandSchema = z.object({
    type: z.literal('altitude'),
    payload: z.object({
        aircraftId: z.string(),
        altitude: z.number(), // feet MSL
        isClimb: z.boolean(), // true for climb, false for descend
    }),
});

export const SpeedCommandSchema = z.object({
    type: z.literal('speed'),
    payload: z.object({
        aircraftId: z.string(),
        speed: z.number(), // knots IAS
    }),
});

export const HandoffCommandSchema = z.object({
    type: z.literal('handoff'),
    payload: z.object({
        aircraftId: z.string(),
        toController: ControllerPositionSchema,
    }),
});

export const CommandSchema = z.discriminatedUnion('type', [
    SpawnAircraftCommandSchema,
    IssueTaxiClearanceCommandSchema,
    TakeoffClearanceCommandSchema,
    LandingClearanceCommandSchema,
    DeleteAircraftCommandSchema,
    LineUpAndWaitCommandSchema,
    // Phase 6: Air commands
    VectorCommandSchema,
    DirectToCommandSchema,
    AltitudeCommandSchema,
    SpeedCommandSchema,
    HandoffCommandSchema,
]);

// TypeScript Types
export * from './airport';
export type Position = z.infer<typeof PositionSchema>;
export type ClearanceType = z.infer<typeof ClearanceTypeSchema>;
export type Clearance = z.infer<typeof ClearanceSchema>;
export type TaxiClearance = z.infer<typeof TaxiClearanceSchema>;
export type VectorClearance = z.infer<typeof VectorClearanceSchema>;
export type DirectToClearance = z.infer<typeof DirectToClearanceSchema>;
export type ClimbClearance = z.infer<typeof ClimbClearanceSchema>;
export type DescendClearance = z.infer<typeof DescendClearanceSchema>;
export type SpeedClearance = z.infer<typeof SpeedClearanceSchema>;
export type ControllerPosition = z.infer<typeof ControllerPositionSchema>;
export type FlightPhase = z.infer<typeof FlightPhaseSchema>;
export type Aircraft = z.infer<typeof AircraftSchema>;
export type WorldState = z.infer<typeof WorldStateSchema>;
export type SpawnAircraftCommand = z.infer<typeof SpawnAircraftCommandSchema>;
export type IssueTaxiClearanceCommand = z.infer<typeof IssueTaxiClearanceCommandSchema>;
export type TakeoffClearanceCommand = z.infer<typeof TakeoffClearanceCommandSchema>;
export type LandingClearanceCommand = z.infer<typeof LandingClearanceCommandSchema>;
export type DeleteAircraftCommand = z.infer<typeof DeleteAircraftCommandSchema>;
export type LineUpAndWaitCommand = z.infer<typeof LineUpAndWaitCommandSchema>;
export type VectorCommand = z.infer<typeof VectorCommandSchema>;
export type DirectToCommand = z.infer<typeof DirectToCommandSchema>;
export type AltitudeCommand = z.infer<typeof AltitudeCommandSchema>;
export type SpeedCommand = z.infer<typeof SpeedCommandSchema>;
export type HandoffCommand = z.infer<typeof HandoffCommandSchema>;
export type Command = z.infer<typeof CommandSchema>;
export { KHEF_GATES, type ParkingGate } from './airport';
