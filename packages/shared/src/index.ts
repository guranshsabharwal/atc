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

// Demo: which "brain" is driving the simulation
export const OperatingModeSchema = z.enum(['HUMAN', 'AI']);

// Demo: which runway "side" is active (south-flow uses 16L/16R, north-flow uses 34L/34R)
export const RunwayConfigSchema = z.enum(['16', '34']);

// Demo: scenario-level metrics shown on the KPI strip
export const MetricsSchema = z.object({
    startedAt: z.number().nullable(),       // ms timestamp; null until scenario started
    completedAt: z.number().nullable(),     // ms timestamp; null until all spawned aircraft departed
    spawned: z.number(),                    // total aircraft spawned in this run
    departed: z.number(),                   // aircraft that successfully took off
    nearMisses: z.number(),                 // unique pair-events under 50 m
    totalTaxiSeconds: z.number(),           // sum of seconds aircraft spent moving on the ground
});

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
    z.object({ type: z.literal('CROSS_RUNWAY'), runwayId: z.string() }), // Cross runway clearance
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
    // Demo fields
    assignedRunwayId: z.string().optional(),  // Pre-assigned (AI) or operator-picked (HUMAN) runway
    suggestedRunwayId: z.string().optional(), // Scenario default; surfaced as the popup default in HUMAN mode
    spawnedAt: z.number().optional(),         // ms timestamp when this aircraft was spawned
    taxiSeconds: z.number().optional(),       // accumulated seconds spent moving on the ground
    isRerouting: z.boolean().optional(),      // true for one tick when AI rerouted this aircraft
    inConflictStop: z.boolean().optional(),   // true while held by 50m proximity check
    conflictHeldSince: z.number().optional(), // ms timestamp of when the current halt began
    manualHold: z.boolean().optional(),       // operator-issued hold (HUMAN/Demo manual stop)
});

export const WorldStateSchema = z.object({
    aircraft: z.array(AircraftSchema),
    runways: z.array(RunwayStateSchema).optional(), // Optional for backward compat during dev
    alerts: z.array(z.string()).optional(),
    timestamp: z.number(),
    mode: OperatingModeSchema.optional(),     // 'HUMAN' or 'AI' driving the run
    metrics: MetricsSchema.optional(),        // KPI strip data
    scenarioRunning: z.boolean().optional(),  // true once start; false again after Reset
    activeConfig: RunwayConfigSchema.optional(), // active runway side
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

// Demo commands
export const SetModeCommandSchema = z.object({
    type: z.literal('setMode'),
    payload: z.object({
        mode: OperatingModeSchema,
    }),
});

export const StartScenarioCommandSchema = z.object({
    type: z.literal('startScenario'),
    payload: z.object({}).default({}),
});

export const ResetScenarioCommandSchema = z.object({
    type: z.literal('resetScenario'),
    payload: z.object({}).default({}),
});

// Used in HUMAN mode: operator clicks an aircraft and assigns it a runway,
// which triggers the existing taxi clearance flow.
export const AssignRunwayCommandSchema = z.object({
    type: z.literal('assignRunway'),
    payload: z.object({
        aircraftId: z.string(),
        runwayId: z.string(),
    }),
});

// Operator-issued hold/release toggle: lets the HUMAN-mode controller (or AI
// mode safety override) freeze an aircraft in place.
export const HoldAircraftCommandSchema = z.object({
    type: z.literal('holdAircraft'),
    payload: z.object({
        aircraftId: z.string(),
        hold: z.boolean(),
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
    // Demo commands
    SetModeCommandSchema,
    StartScenarioCommandSchema,
    ResetScenarioCommandSchema,
    AssignRunwayCommandSchema,
    HoldAircraftCommandSchema,
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
export type SetModeCommand = z.infer<typeof SetModeCommandSchema>;
export type StartScenarioCommand = z.infer<typeof StartScenarioCommandSchema>;
export type ResetScenarioCommand = z.infer<typeof ResetScenarioCommandSchema>;
export type AssignRunwayCommand = z.infer<typeof AssignRunwayCommandSchema>;
export type HoldAircraftCommand = z.infer<typeof HoldAircraftCommandSchema>;
export type OperatingMode = z.infer<typeof OperatingModeSchema>;
export type Metrics = z.infer<typeof MetricsSchema>;
export type RunwayConfig = z.infer<typeof RunwayConfigSchema>;
export type Command = z.infer<typeof CommandSchema>;
export {
    KHEF_GATES,
    KHEF_DEMO_SCENARIO,
    KHEF_RUNWAY_CONFIGS,
    type ParkingGate,
    type ScenarioAircraft,
} from './airport';
