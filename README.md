# ATC Simulation Monorepo

A local-first simulated Air Traffic Control environment.

## Structure

- **apps/web**: Next.js frontend (Next.js 14, Tailwind, shadcn/ui, WebSocket client)
- **apps/sim**: Node.js simulation server (Fastify, ws, in-memory state)
- **packages/shared**: Shared TypeScript types, Zod schemas, and utilities
- **packages/geo**: Placeholder for geospatial logic

## getting Started

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Run Development Mode**
   This will start both the web app (localhost:3000) and the sim server (localhost:3001/3002).
   ```bash
   pnpm dev
   ```

3. **Run Tests**
   ```bash
   pnpm test
   ```

## Architecture via Localhost

- The **Sim Server** runs a tick loop (currently 1Hz) updating the `WorldState`.
- It exposes a WebSocket server on port `3002`.
- The **Web App** connects to `ws://localhost:3002`.
- **Commands** (like `spawnAircraft`) are sent from Client -> Server.
- **Updates** (new `WorldState`) are broadcast from Server -> Client.
