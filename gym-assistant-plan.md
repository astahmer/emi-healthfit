# Gym Assistant — Architecture Plan

## Overview

A personal gym assistant powered by Apple Health + Hevy data. The assistant knows your workout history, recovery status, and health trends to answer questions like "what should I train today?", "am I recovered enough?", "how's my squat progress?", or "what did I do last chest day?". Stack: **TypeScript + Effect 4 + Alchemy** (Infrastructure-as-Effects).

---

## Reference Repositories

| Repo | Location | What to borrow |
|------|----------|----------------|
| **effect-smol** | `.references/effect-smol` | Effect v4 patterns, Cloudflare Worker setup, Effect idioms |
| **alchemy-effect** | `.references/alchemy-effect` | CF Worker/D1/R2 bindings, Stack pattern, `alchemy.run.ts` structure |
| **atproto-likes** | `.references/atproto-likes` | Existing Alchemy project: `alchemy.run.ts`, Worker class, D1 usage |

---

## Data Sources

### 1. Apple Health (via manual export or HealthExportKit app)

| Format | Size | Contents |
|--------|------|----------|
| `export.zip` (Apple native XML) | ~3-5 MB | Everything: workouts, heart rate, sleep, body, steps, etc. |
| `health-export-json.json` (Kit app) | ~1 MB | Structured JSON: activity (daily + 572 workouts), sleep, body |
| `health-export-md.md` (Kit app) | ~640 KB | Markdown tables: sleep/body/activity |

HealthExportKit JSON is the best format — structured, compact, pre-parsed.

**Limitation:** Apple Health only stores strength training metadata (duration, calories, HR), not exercise-level data (sets/reps/weight). Hevy fills that gap.

We can use the HealthExportKit ~1 MB structured JSON with: daily activity (steps, active kcal, exercise min), 572 workouts (cycling, elliptical, strength training, walking), sleep sessions, body metrics.

### Hevy — CSV Export (free, no API)

Hevy has a **free built-in CSV export** — no API key or Pro subscription required.

**How to export:**
- In the app: Profile → Settings → Export & Import Data → Export Data → Export Workouts
- Or on desktop: `https://hevy.com/settings?export`

**In-app:** Profile → Settings → Export & Import Data → Export Data → Export Workouts
**Web:** `https://hevy.com/settings?export`

Current export (`data/hevy/workout_data.csv`):
- 1840 rows, 60 exercises, Apr 2025–Jul 2026
- Columns: `title, start_time, end_time, exercise_title, set_index, set_type, weight_kg, reps, rpe, ...`

Also: `measurement_data.csv` with minimal body weight data.

**Sync cadence:** Manual export once every week or two (whatever cadence you like). Upload alongside the HealthExportKit JSON in the same ingest call. Worker deduplicates by date + exercise + set_index.

### 3. Apple Shortcuts Automation (optional)

Use "Find Health Samples" action to auto-push daily summaries (steps, HR, sleep) to a webhook. This fills gaps between manual exports.

---

## Ingestion Flow (iPhone → Cloudflare)

### Recommended: Share-to-Webhook via Shortcut

1. Export from HealthExportKit (JSON) + Hevy (CSV) — takes ~30s
2. Tap Share on either file → run a Shortcut that collects both files and POSTs them to `https://gym.emi.workers.dev/ingest`
3. Worker validates, parses both, upserts into D1, stores raw blobs in R2

The Shortcut can be a simple "receive file → POST multipart to URL" — no app needed.

### Alternative: Minimal upload page

A single HTML page on Cloudflare Pages with two file inputs (+ a submit button). Open in Safari → pick files → upload. Zero setup.

### Future: Discord bot

A Worker acting as a Discord bot. DM the export files to the bot. It parses, stores, and also serves as the chat interface. Single entry point for everything.

---

## Two Deployment Proposals

### Proposal A — Free Tier ($0/mo)

**Workers Free plan** + Workers AI for LLM. No OpenAI key needed. Everything within free limits.

| Service | Limit | Our usage |
|---------|-------|-----------|
| Workers requests | 100k/day | ~200/day |
| Workers CPU | 10ms/req | Fine for ingest/query. Tight for AI — Workers AI handles inference externally |
| D1 | 5M rows, 5B read units | ~10k rows, negligible reads |
| D1 storage | 5 GB | <100 MB |
| R2 | 10 GB storage, 10M ops | <50 MB, tiny ops |
| KV | 1 GB | <1 MB |
| Queues | 1M ops/mo | ~100/mo |
| AI inference | 10k neurons/day | ~300 neurons/chat (30 chats/day budget) |
| **Total** | **$0/mo** | |

**LLM:** Workers AI (Llama 3.1 8B, free) for simple query/response. Context assembly + recovery score done in-worker.

**Trade-offs:**
- Workers AI has 10ms CPU limit for non-AI work — ingest parsing must be lean
- Smaller model = less nuanced advice
- No AI Gateway (needs Workers Paid)
- 30s CPU timeout, 100 subrequests — adequate for this scale
- 10 neurons per inference request (for workers-ai). Fine for ~30 chats/day

**Bottom line:** Works. No cost. LLM quality is acceptable for fitness advice but not GPT level.

### Proposal B — Workers Paid ($5/mo) + OpenAI

| Service | Cost |
|---------|------|
| Workers Paid | $5/mo (includes D1, R2, KV, Queues, AI Gateway) |
| OpenAI API | ~$1-3/mo (GPT-4o-mini, ~100 chats/month, ~10k tokens/chat) |
| **Total** | **~$6-8/mo** |

**LLM:** OpenAI via AI Gateway (for caching + rate limiting). GPT-4o-mini for quality.

**What $5 unlocks:**
- 30s CPU timeout (vs 10ms free) — safer for parsing
- 1000 subrequests — SSE streaming to client
- AI Gateway (cache OpenAI responses, fallback, rate limit)
- Better D1: 5M rows, 50k read units/day
- Queues for async ingest pipeline

**Trade-off:** $5/mo. Worth it if you want GPT quality and streaming.

**Recommendation:** Start on **Free tier with Workers AI**. If the LLM quality bothers you, it's a one-config swap to add OpenAI — no architecture changes needed.

---

## LLM Options

| Option | Cost | Quality | Where it runs |
|--------|------|---------|---------------|
| Workers AI (Llama 3.1 8B) | Free | Decent for fitness advice | Cloudflare edge |
| OpenAI (GPT-4o-mini) | ~$1-3/mo | Excellent | Cloudflare → OpenAI via AI Gateway |
| OpenWebUI (self-hosted) | Already paying for VPS | Depends on model | Your VPS, accessible from anywhere |

### All three can coexist

```
User asks question
  → Worker receives it
    → If OpenWebUI: proxy the request to your VPS endpoint
    → If OpenAI: call via AI Gateway (with caching)
    → If Workers AI: infer at edge
  → Return response
```

**OpenWebUI integration:** The Worker acts as a proxy/adapter. Your OpenWebUI instance gets a custom tool/endpoint that calls the Worker's API. Or the other way — the chat endpoint can forward to OpenWebUI's API if you're running a model there. Use whichever model fits the query.

---

## Stack: Effect 4 + Alchemy

**Alchemy** (`.references/alchemy-effect`) is Infrastructure-as-Effects. It replaces Terraform/Pulumi and the Worker runtime glue with a single Effect program.

### What it looks like

```ts
// alchemy.run.ts — defines the cloud infra + Worker in one file
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import Api from "./src/api.worker.ts";

export default Alchemy.Stack(
  "gym-assistant",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const api = yield* Api;
    return { url: api.url.as<string>() };
  }),
);
```

```ts
// src/api.worker.ts — the Worker, with typed D1/R2 bindings
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

const DB = Cloudflare.D1.Database("GymData");

export default class Api extends Cloudflare.Worker<Api>()(
  "Api",
  { main: import.meta.url },
  Effect.gen(function* () {
    const db = yield* Cloudflare.D1.QueryDatabase(DB);

    return {
      fetch: Effect.gen(function* () {
        const req = yield* HttpServerRequest;

        if (req.url.startsWith("/chat")) {
          const result = yield* db.query("SELECT * FROM hevy_sets ...");
          // build context, call LLM, return response
          return yield* HttpServerResponse.json({ result });
        }

        return HttpServerResponse.text("ok");
      }),
    };
  }),
) {}
```

**Key patterns from reference repos:**
- `alchemy.run.ts` = the Stack definition (see `atproto-likes/apps/infra/alchemy.run.ts`)
- `Cloudflare.Worker<Api>()` class with typed D1/KV bindings (see `atproto-likes/apps/infra/src/api.worker.ts`)
- `Cloudflare.D1.Database` + `Cloudflare.D1.QueryDatabase` for D1 access
- `Cloudflare.R2.ReadWriteBucket` for raw export storage
- Everything is `Effect.gen` — fully typed, testable, composable

---

## Database Design (D1)

```sql
-- Apple Health daily activity
CREATE TABLE daily_activity (
  date TEXT PRIMARY KEY,
  active_kcal REAL,
  steps INTEGER,
  distance_km REAL,
  exercise_min INTEGER,
  flights_climbed INTEGER
);

-- Apple Health workouts (metadata + HR)
CREATE TABLE health_workouts (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  duration_sec INTEGER,
  active_kcal REAL,
  avg_hr REAL,
  max_hr REAL,
  min_hr REAL,
  distance_km REAL,
  source TEXT,
  raw_json TEXT
);

-- Hevy workout sessions
CREATE TABLE hevy_sessions (
  session_id TEXT PRIMARY KEY,  -- derived from start_time + title
  title TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_sec INTEGER,
  total_volume_kg REAL
);

-- Hevy individual sets (core data)
CREATE TABLE hevy_sets (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES hevy_sessions(session_id),
  exercise_title TEXT NOT NULL,
  set_index INTEGER NOT NULL,
  set_type TEXT,                -- normal, warmup, dropset, failure
  weight_kg REAL,
  reps INTEGER,
  rpe REAL,
  distance_km REAL,
  duration_seconds REAL,
  exercise_notes TEXT,
  UNIQUE(session_id, exercise_title, set_index)
);

-- Sleep sessions from Apple Health
CREATE TABLE sleep_sessions (
  date TEXT,
  start TEXT,
  end TEXT,
  in_bed_min INTEGER,
  asleep_min INTEGER,
  awake_min INTEGER,
  source TEXT
);

-- Body measurements
CREATE TABLE body_metrics (
  date TEXT PRIMARY KEY,
  weight_kg REAL,
  body_fat_pct REAL,
  lean_mass_kg REAL,
  source TEXT
);

-- Sync cursors for dedup
CREATE TABLE sync_cursors (
  source TEXT PRIMARY KEY,  -- 'apple_health', 'hevy'
  last_sync TEXT
);
```

---

## Ingestion Flow

### From iPhone

1. Open HealthExportKit → tap Export JSON → Share Sheet
2. Open Hevy → Export Data → Share Sheet
3. **Share either file** → Shortcut collects both → POSTs to `https://gym.emi.workers.dev/ingest`

**Shortcut simplicity:** Can be a 3-action shortcut: "Receive file" → "Get file size" (optional) → "URL" → "Get contents of URL" (POST multipart). No app needed.

### Without Shortcut

Minimal HTML upload page hosted on Cloudflare Pages + Worker. Open in Safari, pick files, upload.

### On the Worker

```
POST /ingest (multipart: health_export.json + hevy_export.csv)
  → Parse HealthExportKit JSON → upsert daily_activity, health_workouts, sleep
  → Parse Hevy CSV → upsert hevy_sessions, hevy_sets (dedup by session_id + set_index)
  → Store raw files in R2 (backup)
  → Return summary: "Imported 12 new workouts, 184 new sets"
```

---

## Assistant Design

### Architecture

```
User (Discord / web UI / OpenWebUI)
  → Worker (chat endpoint)
    → Effect program:
       1. Fetch today's health data (sleep, HRV, RHR)
       2. Fetch recent Hevy workouts (last 14 days)
       3. Calculate recovery score
       4. Build prompt context
       5. Call OpenAI via AI Gateway
       6. Return response
```

### Recovery Score (computed in Worker)

```
rhr_baseline = avg(rest_hr last 7d)
hrv_baseline  = avg(hrv last 7d)
sleep_debt    = (target_8h * 7) - sum(sleep last 7d)
strain_48h    = sum(hevy_sets volume weight×reps last 48h)

score = weighted(rhr_deviation, hrv_deviation, sleep_debt, strain_48h)
→ "🟢 Ready" / "🟡 Caution" / "🔴 Rest needed"
```

### Prompt Template

```
You are the user's personal gym assistant with access to their Apple Health
and Hevy workout data.

Today: {date}
Recovery: {recovery_label} — {explanation}
Last workout: {last_workout_summary}
Last 7 days: {sleep_avg}h sleep avg, {workout_count} workouts

Relevant workout history:
{retrieved_context}
---

{user_message}
```


### Chat flow

```
User: "how's my bench press progressing?"
  → Worker /chat endpoint
    → SQL: SELECT * FROM hevy_sets WHERE exercise_title LIKE '%bench%'
           ORDER BY start_time LIMIT 30
    → SQL: SELECT * FROM daily_activity ORDER BY date DESC LIMIT 7
    → SQL: SELECT * FROM sleep_sessions ORDER BY date DESC LIMIT 7
    → Build prompt with context + recovery score
    → Call LLM (Workers AI / OpenAI / OpenWebUI)
    → Return response
```

### Recovery score (computed in-worker)

```
RHR_baseline   = avg(resting_hr) last 7 days
HRV_baseline   = avg(hrv) last 7 days
sleep_debt     = (8h × 7) - sum(sleep last 7d)
strain_48h     = sum(hevy volume weight×reps last 48h)

score = weighted(rhr_dev, hrv_dev, sleep_debt, strain)
→ "🟢 Ready" / "🟡 Cautious" / "🔴 Rest needed"
```

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/ingest` | POST | Upload HealthExportKit JSON + Hevy CSV |
| `/chat` | POST | Ask the assistant |
| `/chat/stream` | POST | Streaming response (free tier: polling, paid: SSE) |
| `/api/recovery` | GET | Today's recovery score |
| `/api/workouts` | GET | Query workout history |
| `/api/exercises/:name` | GET | Exercise progression data |

---

## OpenWebUI Integration

Your VPS-hosted OpenWebUI connects two ways:

1. **OpenWebUI as a tool:** Add a "Gym Assistant" tool in OpenWebUI that calls `https://gym.emi.workers.dev/chat`. Lets you ask workout questions within OpenWebUI using your local model.

2. **OpenWebUI as a backend:** Your Worker's `/chat` endpoint can proxy to your OpenWebUI API URL when you want to use the model you already have running. Just set `OPENWEBUI_URL` in Worker env vars.

Both can coexist — route by query type or model preference.

---

## Implementation Phases

### Phase 1 — Core (weekend)
- [ ] Scaffold Alchemy project: `alchemy.run.ts` + Worker class
- [ ] D1 schema + migrations (Alchemy handles this natively)
- [ ] `/ingest` — parse HealthExportKit JSON + Hevy CSV
- [ ] Basic `/chat` — fixed prompt + last workout context + Workers AI
- [ ] Deploy to Cloudflare
- [ ] Verify with actual data from `data/`

### Phase 2 — Polish
- [ ] Recovery score
- [ ] Dynamic context assembly (SQL based on question intent)
- [ ] `POST /chat/stream` SSE streaming
- [ ] Upload via Shortcut (Share Sheet)
- [ ] OpenWebUI integration

### Phase 3 — Dashboard (future)
- [ ] Cloudflare Pages dashboard
- [ ] Charts: weekly volume, muscle group balance, PR progression
- [ ] Alchemy handles static site deployment (`Cloudflare.Website.Vite`)

---

## Deployment Commands

```bash
# Worker paid (Proposal B)
npx wrangler deploy

# Free tier (Proposal A) — same code, just no AI Gateway
npx wrangler deploy

# Alchemy deploy
bun run alchemy deploy
```

---

## Edge Cases

- **Hevy CSV dedup:** `(start_time, exercise_title, set_index)` — full export every time, only insert new rows
- **Date parsing:** Hevy uses `12 Jul 2026, 15:11` format — parse with Temporal or `date-fns`
- **Large exports:** ~1 MB JSON + ~200 KB CSV — fits in free Worker body limit (10 MB)
- **Privacy:** Data in D1/R2. OpenAI calls through AI Gateway for caching. OpenWebUI calls stay on your VPS.

---

## Original Prompt

> I'm using Apple Health + have an Apple Watch and fill my workout sessions data on Hevy. I'd love to make a custom gym assistant and maybe in the future with a dashboard showing workouts graphs/stats etc. But for now mostly the assistant is the main focus. I need to make that work on Cloudflare free tier so I can access it from anywhere. I have access to Apple Health data through a manual export once in a while or using the Health Export Kit. Apple Health export is in `data/export.zip` and unzipped in `apple_health_export`. The HealthExportKit app allows me to export in either JSON or MD; those are the 2 `health-export-*` files you can see in the `data` folder. Ideally the flow would be super simple and doable from my iPhone so I can just share one of the files (`export.zip` or JSON/MD from Kit app) to {somewhere} (a Discord bot? WhatsApp? a dedicated frontend hosted on CF Workers? through my custom OpenWebUI (self-hosted ChatGPT using OpenAI API key)? etc.)
