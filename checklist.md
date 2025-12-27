# ATC Simulator Web App (KHEF) — Development Checklist (No-Docker)

> **Intent:** training/simulation only (not for real-world ATC operations).

This checklist is ordered to get a working MVP quickly, then expand realism, then add AI “advisors/autopilots” with a **hard safety validator**.

---

## Tech stack (chosen defaults)

### Monorepo & tooling
- **pnpm** (workspace)
- **Turborepo** (task runner / caching)
- **TypeScript** everywhere
- **ESLint + Prettier**
- **Vitest** (unit tests) + **Playwright** (E2E)

### Web app (client)
- **Next.js (App Router) + React**
- **TailwindCSS + shadcn/ui**
- **Zustand** (UI state)
- **MapLibre GL JS** (WebGL map rendering)
- **PMTiles + pmtiles protocol plugin** (serverless vector tiles)
- **deck.gl** (high-perf dynamic layers: aircraft targets, trails, heatmaps)
- **@turf/turf** (GeoJSON ops: buffers, intersections, distances)

### Simulation backend (server-authoritative)
- **Node.js + Fastify**
- **WebSocket** (`ws` + Fastify integration)
- **Zod** (runtime validation for all client→server commands)

### Data & persistence (no Docker required)
- **PostgreSQL + PostGIS** (choose one):
  - Local install (Homebrew/apt/choco), or
  - Managed Postgres (Neon/Supabase/RDS/etc.)
- **Prisma** (ORM & migrations)
- **Redis + BullMQ** (optional; can be deferred until you need background jobs)

### AI
- **OpenAI Responses API** (tool/function calling, structured output, streaming)
- **Zod/JSON Schema** for structured outputs (clearances, advisories)

### Airport/Map data sources
- **OurAirports CSV** for base airport metadata
- **OpenStreetMap** aeroway features for runways/taxiways/aprons (queried via **Overpass API / Overpass Turbo**)

---

# Phase 0 — Scope, product spec, and safety rails (1–2 days)

## 0.1 Product + UX spec (write first, keep short)
- [x] Create `docs/product-spec.md` (MVP vs v1 vs v2; single-player vs multi-user; time scaling; roles).
- [x] Define controller positions for MVP:
  - [x] Ground
  - [x] Tower/Local
  - [x] Approach/Departure (simplified)
- [x] Define the radio interface for MVP:
  - [x] Typed commands only (no voice)
  - [x] Transcript/radio log UI
- [x] Add a “simulation only” banner + splash disclaimer.

## 0.2 Architecture decision record (ADR)
- [x] Server-authoritative sim + thin clients (WebSocket state streaming).
- [x] Deterministic sim tick (fixed timestep) + replay logs.

**Deliverables**
- [x] `docs/architecture.md`
- [x] `docs/adr/0001-server-authoritative.md`

---

# Phase 1 — Repo bootstrap & baseline CI (same day)

## 1.1 Monorepo scaffold
- [x] Initialize pnpm workspace + Turborepo:
  - [x] `apps/web` (Next.js)
  - [x] `apps/sim` (Fastify WS server)
  - [x] `packages/shared` (types, Zod schemas)
  - [x] `packages/geo` (GeoJSON utilities, Turf wrappers)
- [x] Add ESLint/Prettier configs + TS project refs.
- [x] Add Vitest + Playwright scaffolding.

## 1.2 Local dev environment (no Docker)
- [x] Decide DB strategy:
  - [x] **Local Postgres+PostGIS** OR **Managed Postgres**
- [x] Add `DATABASE_URL` env handling:
  - [x] `.env.example` at repo root
  - [x] `apps/sim/.env.example` (if needed)
- [x] Add Prisma:
  - [x] `prisma/schema.prisma`
  - [x] `pnpm db:migrate`
  - [x] `pnpm db:seed` (minimal seed, can be empty initially)
- [x] If you need jobs later:
  - [x] add `REDIS_URL` (optional)
  - [x] keep BullMQ behind a feature flag (don’t block MVP)

## 1.3 CI baseline
- [x] Add GitHub Actions:
  - [x] lint
  - [x] typecheck
  - [x] unit tests
  - [x] E2E smoke

**Deliverables**
- [x] `pnpm dev` runs web + sim server
- [x] CI green on first commit

---

# Phase 2 — “KHEF world data” pipeline (airport + ground graph) (2–5 days)

> Goal: produce **versioned, auditable** data files you can render and simulate.

## 2.1 Airport metadata ingest (OurAirports)
- [x] Create `data/raw/ourairports/` and ingest:
  - [x] `airports.csv` / `runways.csv` / `navaids.csv` (as needed)
- [x] Write a Node ingest script:
  - [x] Parse OurAirports CSV → `data/derived/khef/airport.base.json`
  - [x] Validate with Zod schemas
- [x] Store provenance (source file + date + hash).

## 2.2 OSM extraction for aeroways (layout)
- [x] Use Overpass Turbo to prototype queries for:
  - [x] `runway`, `taxiway`, `apron`, `parking_position` in KHEF bbox.
- [x] Add scripts to pipeline:
  - [x] Fetch Overpass API → `data/raw/osm/khef.geojson`.
  - [x] Convert to GeoJSON (using `osmtogeojson`). (if available)
- [x] Bake a reproducible Overpass query into `data/raw/osm/khef.overpassql`.
- [x] Implement extractor script:
  - [x] Run Overpass query → GeoJSON in `data/raw/osm/khef.geojson`
  - [x] Normalize tags (names/refs)
  - [x] Validate geometry

## 2.3 Build the **ground movement graph**
- [ ] Convert taxiway lines + runway hold points → graph:
  - [ ] Nodes: intersections, hold-shorts, runway entries/exits, parking nodes
  - [ ] Edges: taxi segments (length, allowed directions, restrictions)
- [ ] Use Turf for geometry:
  - [ ] Snap/merge near-intersections
  - [ ] Compute lengths and bearings
- [ ] Output: `data/derived/khef/ground.graph.json`

## 2.4 PMTiles basemap (local region)
- [ ] Create a small regional basemap tileset:
  - [ ] OSM extract → vector tiles → **PMTiles**
- [ ] Host PMTiles on static storage (S3/R2/Vercel Blob/etc.)
- [ ] Load PMTiles in MapLibre using the pmtiles protocol plugin.

**Deliverables**
- [ ] `data/derived/khef/airport.base.json`
- [ ] `data/derived/khef/ground.graph.json`
- [ ] `data/raw/osm/khef.geojson`
- [ ] `data/raw/osm/khef.overpassql`
- [ ] `khef.pmtiles` (optional but recommended)

---

# Phase 3 — Map rendering MVP (Ground scope) (2–4 days)

## 3.1 Ground scope UI
- [ ] Add MapLibre map view:
  - [ ] Load basemap via PMTiles (or public tiles while prototyping)
- [ ] Render airport overlays from your derived GeoJSON:
  - [ ] Runways/taxiways/aprons (as vector layers)
  - [ ] Labels (ref/name)
- [ ] Render ground graph debug overlays (toggle):
  - [ ] nodes + edges

## 3.2 Aircraft targets (static first)
- [ ] Implement `AircraftTargetLayer` using deck.gl:
  - [ ] Position, callsign, heading stub
- [ ] Click-select an aircraft, show an info panel.

**Deliverables**
- [ ] Airport renders correctly (manual check + optional screenshot test)
- [ ] Can select a target and see details

---

# Phase 4 — Simulation kernel MVP (taxi only) (4–10 days)

## 4.1 Shared types + command protocol
- [ ] Define shared schemas in `packages/shared`:
  - [ ] `AircraftState`, `ControllerState`, `Clearance`, `EventLogEntry`
  - [ ] Client→server commands:
    - [ ] `spawnAircraft`
    - [ ] `issueTaxiClearance`
    - [ ] `cancelClearance`
- [ ] Enforce Zod validation server-side on every command.

## 4.2 Sim tick + state replication
- [ ] Implement sim loop in `apps/sim`:
  - [ ] Fixed timestep (e.g., 10 Hz)
  - [ ] Deterministic RNG seed per scenario
- [ ] WebSocket streaming:
  - [ ] Snapshot on connect + deltas thereafter

## 4.3 Taxi movement model
- [ ] Pathfinding over `ground.graph.json`:
  - [ ] A* (recommended) or Dijkstra
- [ ] Movement along route:
  - [ ] Speed profiles, stop at hold short, wait states
- [ ] Ground conflict primitives:
  - [ ] Node/edge occupancy
  - [ ] Hold-short compliance tracking

**Deliverables**
- [ ] Spawn aircraft at parking
- [ ] Issue taxi clearance
- [ ] Aircraft follows route and stops at holds

---

# Phase 5 — Tower MVP (runway ops) (4–10 days)

## 5.1 Runway state model
- [ ] Runway occupancy, lineup state, landing rollout state
- [ ] Runway crossing logic:
  - [ ] clearance required
  - [ ] incursion detection

## 5.2 Tower clearances (structured)
- [ ] Implement:
  - [ ] `lineUpAndWait(runway, intersection?)`
  - [ ] `clearedForTakeoff(runway, restrictions?)`
  - [ ] `clearedToLand(runway, restrictions?)`
- [ ] Add basic separation rules (time/distance based, simplified).

## 5.3 Tower UI
- [ ] “Local/Tower” view:
  - [ ] arrival/departure queue
  - [ ] runway occupancy timeline
  - [ ] quick action buttons

**Deliverables**
- [ ] Complete VFR pattern scenario without conflicts
- [ ] Runway incursion warning fires when violated

---

# Phase 6 — Approach/Departure MVP (radar scope + sequencing) (5–14 days)

## 6.1 Radar scope UI
- [ ] MapLibre base + “radar style” layer
- [ ] Data blocks (callsign, altitude, GS)
- [ ] Tools:
  - [ ] range rings
  - [ ] measuring tool (Turf distance)

## 6.2 Simple air movement model
- [ ] Lateral navigation:
  - [ ] direct-to fixes
  - [ ] vector headings
- [ ] Vertical model:
  - [ ] climb/descent rates
- [ ] Speed control model

## 6.3 Handoffs and ownership
- [ ] Implement aircraft “controller ownership” state:
  - [ ] Approach owns until handoff accepted by Tower
- [ ] Enforce: only owning controller can issue air clearances.

**Deliverables**
- [ ] IFR arrival flow to final with handoff to tower
- [ ] Departure flow with climb-out and handoff

---

# Phase 7 — Scenario system + replay + metrics (3–7 days)

## 7.1 Scenario format
- [ ] Define `ScenarioSpec` JSON:
  - [ ] weather
  - [ ] spawn schedule
  - [ ] expected runways
  - [ ] objectives
- [ ] Scenario runner (server):
  - [ ] schedule spawns/events
  - [ ] deterministic seed

## 7.2 Replay
- [ ] Append-only event log:
  - [ ] state snapshots every N seconds
  - [ ] all commands/events
- [ ] Web UI replay controls:
  - [ ] scrubber
  - [ ] pause/rewind
  - [ ] speed

## 7.3 Metrics
- [ ] Compute:
  - [ ] taxi delay
  - [ ] takeoff/landing throughput
  - [ ] go-arounds
  - [ ] incursion counts
  - [ ] separation loss count (per your rules)
- [ ] Save results to Postgres (Prisma).

**Deliverables**
- [ ] 10 “golden” scenarios checked into repo
- [ ] Regression test: scenarios produce stable metrics

---

# Phase 8 — ATC rules engine + validator (hard safety layer) (5–14 days)

> This is the layer that makes AI safe/usable.

## 8.1 Clearance compiler
- [ ] Convert UI intents → structured clearances
- [ ] Convert clearances → constraints on aircraft movement (ground + air)

## 8.2 Validator (must pass before applying clearance)
- [ ] Validate ground clearances:
  - [ ] no conflicting runway crossing
  - [ ] no head-on taxi conflicts (edge occupancy)
- [ ] Validate runway clearances:
  - [ ] runway clear
  - [ ] separation timer windows
- [ ] Validate air clearances:
  - [ ] min separation (simplified)
  - [ ] no vector into prohibited areas (if modeled)

## 8.3 Explainability
- [ ] Every rejection returns:
  - [ ] machine-readable reason codes
  - [ ] human text explanation

**Deliverables**
- [ ] Unit tests covering validator rules (Vitest)
- [ ] “AI cannot bypass validator” invariant test

---

# Phase 9 — AI v1: advisor mode (suggest → human approves) (5–14 days)

## 9.1 AI wiring (Responses API)
- [ ] Add server-side “AI service” module:
  - [ ] OpenAI Responses API client
  - [ ] Streaming support to UI
- [ ] Define tool/function calls:
  - [ ] `propose_taxi_route(aircraftId, destination)`
  - [ ] `propose_departure_sequence(runway, aircraftIds)`
  - [ ] `propose_arrival_sequence(runway, aircraftIds)`
  - [ ] `explain_rejection(clearance, validatorErrors)`
- [ ] Force structured outputs (Zod→JSON schema).

## 9.2 Ground AI advisor
- [ ] Inputs: ground graph, current occupancy, planned spawns
- [ ] Outputs: suggested taxi route + holds
- [ ] UI: “Apply suggestion” button → runs through validator

## 9.3 Tower AI advisor
- [ ] Suggest: runway config + departure release timing
- [ ] Suggest: landing sequence adjustments

## 9.4 Approach AI advisor
- [ ] Suggest: speeds/vectors to build sequence
- [ ] Suggest: handoff timing

**Deliverables**
- [ ] AI suggestions appear in UI quickly (streaming)
- [ ] All AI actions require explicit human approval in v1

---

# Phase 10 — AI v2: pilot agents (readbacks + execution) (7–21 days)

## 10.1 Pilot agent state machine
- [ ] Implement pilot intent + compliance states:
  - [ ] acknowledges clearance
  - [ ] delayed compliance
  - [ ] occasional errors (configurable)

## 10.2 Phraseology layer (text first)
- [ ] Structured clearance → phraseology template system
- [ ] Pilot readback generator
- [ ] Controller readback-checker (pattern match + schema parse)

## 10.3 Optional voice
- [ ] MVP TTS: Web Speech API (browser)
- [ ] Later: dedicated TTS provider (swap-in module)

**Deliverables**
- [ ] End-to-end “typed ATC ↔ pilot readback” loop
- [ ] Configurable error rate for training

---

# Phase 11 — Multi-user + instructor tools (optional) (7–30 days)

## 11.1 Auth & roles
- [ ] Add Auth.js (NextAuth) for login
- [ ] Roles: student/controller/instructor

## 11.2 Multi-position staffing
- [ ] Multiple controllers connect to the same sim:
  - [ ] sector ownership
  - [ ] handoffs between humans

## 11.3 Instructor console
- [ ] Inject events:
  - [ ] runway closure
  - [ ] comm failure
  - [ ] emergency
- [ ] Freeze/rewind + debrief markers

---

# Phase 12 — Polish, performance, deployment (ongoing)

## 12.1 Performance
- [ ] Profile rendering:
  - [ ] move targets to deck.gl
  - [ ] minimize MapLibre layer churn
- [ ] Profile sim server:
  - [ ] tick time budget
  - [ ] delta compression

## 12.2 Deployment
- [ ] Web: Vercel (or equivalent)
- [ ] Sim server: Fly.io / Render / Railway / your own VM
- [ ] Postgres: managed provider (recommended) or your local instance

## 12.3 Observability
- [ ] Structured logs (pino)
- [ ] Error tracking (Sentry)
- [ ] Basic metrics dashboard

---

## Prompting note (for agentic IDE)

Work in **small PR-sized slices**. Each slice must include:
- code changes
- tests (where applicable)
- docs updates
- a short “how to run” section

Prefer completing **Phase-by-phase**, but implement **task-by-task** inside each phase.
