# Gym Assistant — Architecture Plan

## Overview

A personal gym assistant powered by Apple Health + Hevy data, hosted on Cloudflare Workers ($5/mo plan). The assistant knows your workout history, recovery status, and health trends to answer questions like "what should I train today?", "am I recovered enough?", "how's my squat progress?", or "what did I do last chest day?"

Stack: **TypeScript + Effect 4** on Workers, **OpenAI** for the LLM, **D1** for storage.

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

### 2. Hevy — CSV Export (free, no API needed)

Hevy has a **free built-in CSV export** — no API key or Pro subscription required.

**How to export:**
- In the app: Profile → Settings → Export & Import Data → Export Data → Export Workouts
- Or on desktop: `https://hevy.com/settings?export`

**CSV columns:**
```
title, start_time, end_time, description, exercise_title, superset_id,
exercise_notes, set_index, set_type, weight_kg, reps, distance_km,
duration_seconds, rpe
```

Every set, rep, and weight you've ever logged. This is the full exercise-level data.

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

## Cloudflare Stack ($5/mo Workers Paid Plan)

| Service | Use | Monthly Cost |
|---------|-----|-------------|
| **Workers Paid** | API endpoints, ingest, cron, chat | $5 |
| **D1** | Structured data — workouts, sets, sleep, body | Included in $5 |
| **R2** | Raw export blob backup | Free tier (10 GB) |
| **KV** | Config, sync cursors, session state | Free tier |
| **Queues** | Async ingest pipeline | Free tier (1M/mo) |
| **Pages** | Dashboard frontend (future) | Free tier |
| **AI Gateway** | Cache/reliability layer for OpenAI calls | Free tier |

### Why $5/mo Workers Paid?

Workers Paid ($5) unlocks:
- D1 (included)
- Longer CPU time (30s vs 10s) — needed for parsing + LLM calls
- More subrequests (1000/req vs 50)
- Queue support

Everything else fits in free tier limits.

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

-- Hevy individual sets (the core data)
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

## LLM Assistant Design

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

### RAG (no embeddings needed)

Single-user dataset is small (<10k rows). Just SQL queries:
- `"how's my bench press?"` → `SELECT * FROM hevy_sets WHERE exercise_title LIKE '%bench%' ORDER BY start_time DESC LIMIT 20`
- `"what did I do last chest day?"` → `SELECT * FROM hevy_sets WHERE session_id IN (SELECT session_id FROM hevy_sets WHERE exercise_title LIKE '%chest%') ORDER BY start_time DESC`

Simple, deterministic, fits in context window.

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/ingest` | POST | Upload HealthExportKit JSON + Hevy CSV |
| `/chat` | POST | Ask the assistant |
| `/chat/stream` | POST | Streaming response (SSE) |
| `/api/recovery` | GET | Today's recovery score |
| `/api/workouts` | GET | Query workout history |
| `/api/exercises/:name` | GET | Exercise progression data |
| `/api/stats` | GET | Aggregated stats (volume, PRs) |

---

## Implementation Phases

### Phase 1 — Core (weekend project)
- [ ] Scaffold Workers project with Effect 4 + D1
- [ ] D1 schema + migrations
- [ ] `/ingest` — parse HealthExportKit JSON + Hevy CSV, upsert into D1, store raw in R2
- [ ] `/chat` — basic OpenAI call with fixed prompt + last workout context
- [ ] Discord bot worker (optional)

### Phase 2 — Polish
- [ ] Recovery score calculation
- [ ] Dynamic context assembly (SQL queries based on question intent)
- [ ] `/chat/stream` SSE streaming
- [ ] Web UI (tiny HTML page on Pages)

### Phase 3 — Dashboard (future)
- [ ] Cloudflare Pages dashboard
- [ ] Charts: volume over time, muscle group balance, PR progression
- [ ] Data export from D1

---

## Deployment

```bash
npm create cloudflare@latest gym-assistant -- --experimental
cd gym-assistant
npx wrangler d1 create gym-data
npx wrangler d1 migrations create gym-data init
# write migration SQL
npx wrangler deploy
```

Worker at `gym.emi.workers.dev`. Discord bot on a separate route. All deploys with `wrangler deploy`.

---

## Edge Cases & Considerations

- **Hevy CSV dedup:** Hevy exports the full history every time. Dedup on `(start_time, exercise_title, set_index)` — insert only new rows.
- **Privacy:** Data stays in D1/R2. OpenAI calls go through AI Gateway for caching + cost control.
- **Export format changes:** Version everything. Store raw blobs in R2 for reprocessing if the parser changes.
- **Single-user:** No auth needed. If exposing publicly, add a simple token check.
- **Large CSV:** A multi-year Hevy export is maybe 5-10k rows. Tiny for D1.

---

## Original Prompt

> I'm using Apple Health + have an Apple Watch and fill my workout sessions data on Hevy. I'd love to make a custom gym assistant and maybe in the future with a dashboard showing workouts graphs/stats etc. But for now mostly the assistant is the main focus. I need to make that work on Cloudflare free tier so I can access it from anywhere. I have access to Apple Health data through a manual export once in a while or using the Health Export Kit. Apple Health export is in `data/export.zip` and unzipped in `apple_health_export`. The HealthExportKit app allows me to export in either JSON or MD; those are the 2 `health-export-*` files you can see in the `data` folder. Ideally the flow would be super simple and doable from my iPhone so I can just share one of the files (`export.zip` or JSON/MD from Kit app) to {somewhere} (a Discord bot? WhatsApp? a dedicated frontend hosted on CF Workers? through my custom OpenWebUI (self-hosted ChatGPT using OpenAI API key)? etc.)
