# Architecture

## Server-Authoritative Simulation

The simulation is **server-authoritative**. All logic regarding aircraft movement, spawning, and collision detection happens on the `apps/sim` server.

### Tick Loop
The server runs a main loop (tick) that:
1. Processes incoming commands queue.
2. Updates physics/state for all aircraft (e.g., updating position based on velocity).
3. Broadcasts the new `WorldState` to all connected clients.

### Data Flow

```mermaid
sequenceDiagram
    participant Web as Web Client
    participant Sim as Sim Server
    
    Web->>Sim: Connect (WS port 3002)
    Sim-->>Web: Initial WorldState
    
    Note over Web,Sim: User clicks "Spawn Aircraft"
    Web->>Sim: Command: spawnAircraft { callsign: "UAL123", ... }
    
    Note over Sim: Validates Command (Zod)
    Note over Sim: Updates State (add Aircraft)
    
    Sim-->>Web: Broadcast: WorldState (contains new aircraft)
    Web->>Web: Render updated list
```

### Shared Schemas
We use `zod` in `packages/shared` to share validation logic between the frontend (input validation) and backend (command validation).
