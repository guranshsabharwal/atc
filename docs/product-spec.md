# Product Specification

## Vision
A high-fidelity, web-based ATC training simulation primarily for single-player practice, with future capabilities for AI advisory and multi-user instruction.

## Scope
### MVP (Current Phase)
- **Roles**: Single-player (Omni-controller).
- **Positions**: Ground, Tower (Local), Approach/Departure (basic sequencing).
- **Environment**: Fixed KHEF (simulation world), simple weather.
- **Safety**: "Simulation Only" banner always visible.

### Future Versions
- **v1**: AI Advisor mode (suggestions for routes/sequences).
- **v2**: AI Pilot Agents (voice/text readbacks).
- **v3**: Multi-user (Instructor + Student stations).

## User Interface
### Radio
- **Input**: Typed text commands (e.g., `UAL123 taxi via A B`).
- **Output**: Text log of communications.
- **No Voice** for MVP.

### Map Scope
- **Ground**: Zoomed in, viewing taxiways/runways.
- **Radar**: Zoomed out, viewing approach/departure sectors with data blocks.

## Simulation Rules
- **Server-Authoritative**: The server decides where aircraft are.
- **Deterministic**: The same inputs + same seed = same outcome.

## Disclaimer
> **CRITICAL**: This software is for **simulation and training purposes only**. It must NOT be used for real-world air traffic control or operational planning.
