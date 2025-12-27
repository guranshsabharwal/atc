# ADR 0001: Server-Authoritative Simulation

## Status
Accepted

## Context
We are building an Air Traffic Control simulation that requires:
1.  Consistency between what the user sees and what the system believes.
2.  Potential for future multi-user support (Instructor + Student).
3.  Deterministic replay for debriefing and training analysis.
4.  Prevention of client-side desync or "cheating" (in a training context, this means "invalid states").

## Decision
We will use a **Server-Authoritative** architecture.

- **State Ownership**: The `apps/sim` Node.js server holds the single source of truth for `WorldState` (aircraft positions, weather, flight plans).
- **Client Role**: The `apps/web` client is a "dumb terminal" that renders the state and sends user intents (Commands).
- **Communication**: 
    - **Downstream**: Server broadcasts full state snapshots (or delta compressed updates) via WebSockets.
    - **Upstream**: Client sends transactional Commands (e.g., `spawnAircraft`, `issueClearance`) validated by Zod schemas.

## Consequences
### Positive
- **Determinism**: We can record the command stream and replay the entire session exactly.
- **Security/Integrity**: Invalid commands (e.g., spawning on top of another plane) are rejected by the server before affecting the state.
- **Multi-user**: synchronization is simplified; all clients view the same server state.

### Negative
- **Latency**: User actions feel slightly delayed by RTT (Round Trip Time). We will mitigate this with client-side prediction only if strictly necessary for UI responsiveness (e.g., typing text), but physics/movement will remain server-driven.
- **Complexity**: Requires running a separate stateful server process, rather than a serverless/stateless request handler.
