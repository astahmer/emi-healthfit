# Handoff: Build Gym Assistant Backend

## Context

I've designed a personal gym assistant using **Apple Health + Hevy data**, hosted on **Cloudflare Workers** with **Effect 4 + Alchemy** (Infrastructure-as-Effects). The plan is in `gym-assistant-plan.md`. The data files are in `data/`.

## Reference Repositories

Read these for patterns:

| Repo | Path | Why |
|------|------|-----|
| alchemy-effect | `.references/alchemy-effect` | Framework docs, `AGENTS.md`, Cloudflare Worker examples |
| effect-smol | `.references/effect-smol` | Effect 4 patterns, CF Workers adapters |
| atproto-likes | `.references/atproto-likes` | Real Alchemy project — see `apps/infra/alchemy.run.ts` + `apps/infra/src/api.worker.ts` |

## Bootstrap Approach

**Do NOT use `create-alchemy`** (it's for a different framework). Instead:

### Option A — Copy from alchemy-effect example (recommended)

Copy `.references/alchemy-effect/examples/cloudflare-worker/` as the starting point:

```
gym-assistant/
├── alchemy.run.ts         # Stack definition (keep, replace Api.ts)
├── package.json            # keep, update deps
├── tsconfig.json           # keep as-is
├── src/
│   ├── Api.ts              # REPLACE completely with gym assistant routes
│   ├── ingest/             # NEW — parser for HealthExportKit JSON + Hevy CSV
│   │   ├── health.ts
│   │   └── hevy.ts
│   ├── chat/               # NEW — LLM context builder + chat handler
│   │   ├── context.ts
│   │   └── handler.ts
│   └── db/                 # NEW — D1 schema + migrations
│       └── schema.ts
└── test/
    └── integ.test.ts       # strip or replace
```

Remove all the example-specific files: `Agent.ts`, `Room.ts`, `Sandbox.ts`, `SecondaryApi.ts`, `WorkerTag.ts`, `Repos.ts`, `NotifyWorkflow.ts`, `Queue.ts`, `Bucket.ts`, `KV.ts`, `AiGateway.ts`.

### Option B — Copy local atproto-likes infra

Copy `apps/infra/` from the symlink at `.references/atproto-likes`. It's a real Alchemy project, but has more monorepo overhead (pnpm workspace, multiple apps). If going this route, extract just `apps/infra/` and flatten to a single package.

## What to Build

### Phase 1 — Core

1. **D1 Database**: Create tables for `daily_activity`, `health_workouts`, `hevy_sessions`, `hevy_sets`, `sleep_sessions`, `body_metrics` (schema in `gym-assistant-plan.md`)
2. **`POST /ingest`**: Accept multipart with `health_export.json` + `hevy_export.csv`
   - Parse HealthExportKit JSON → upsert daily activity, workouts, sleep
   - Parse Hevy CSV → upsert sessions + sets (dedup by `start_time + exercise_title + set_index`)
   - Store raw blob in R2
   - Hevy CSV columns: `title`, `start_time`, `end_time`, `exercise_title`, `set_index`, `set_type`, `weight_kg`, `reps`, `rpe`
   - Date format: `12 Jul 2026, 15:11`
3. **`POST /chat`**: Basic endpoint that:
   - Fetches last workout + today's health data from D1
   - Builds a prompt with context
   - Calls LLM (start with Workers AI `@cf/meta/llama-3.1-8b-instruct`, make model configurable)
   - Returns response
   - Keep it simple: no streaming, no fancy routing yet
4. **`GET /api/recovery`**: Recovery score computed from last 7 days of sleep/HR/volume

### Data Files for Testing

Use the real data in `data/`:
- `health-export-json-2022-01-01-0000_to_2026-07-13-1526.json` — HealthExportKit export with 572 workouts
- `hevy/workout_data.csv` — 1840 sets across 60 exercises (Apr 2025–Jul 2026)

### LLM Options

Make the model configurable via env var `LLM_PROVIDER`:
- `workers-ai` (default, free) — use `@cf/meta/llama-3.1-8b-instruct`
- `openai` — use OpenAI API via AI Gateway or direct call

## Expected Patterns

- Use `Cloudflare.Worker<Api>()` class (see atproto-likes pattern)
- Use `Cloudflare.D1.Database` + `Cloudflare.D1.QueryDatabase` for D1
- Use `Cloudflare.R2.ReadWriteBucket` for raw export storage
- Everything in `Effect.gen` — no raw async/await
- Alchemy's `alchemy.run.ts` defines the Stack + deploys the Worker
- `pnpm` package manager

## Files Not to Touch

- `gym-assistant-plan.md` — reference/context only
- `reference-repos.md` — reference list
- `data/` — data files only

## Commands to Verify

```bash
cd gym-assistant
pnpm install
bun alchemy deploy   # deploys to Cloudflare
```
