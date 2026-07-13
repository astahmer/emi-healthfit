# Gym Assistant — Architecture Plan

## Overview

A personal gym assistant powered by Apple Health + Hevy data, hosted on Cloudflare's free tier. The assistant knows your workout history, recovery status, and health trends to answer questions like "what should I train today?", "am I recovered enough?", "how's my squat progress?", or "what did I do last chest day?"

---

## Data Sources

### 1. Apple Health (via manual export or HealthExportKit app)

| Format | Size | Contents |
|--------|------|----------|
| `export.zip` (Apple native XML) | ~3-5 MB | Everything: workouts, heart rate, sleep, body, steps, etc. |
| `health-export-json.json` (Kit app) | ~1 MB | Structured JSON: activity (daily + 572 workouts), sleep, body |
| `health-export-md.md` (Kit app) | ~640 KB | Markdown tables: sleep/body/activity |

HealthExportKit JSON is the best format to build on — structured, compact, parsed.

**Limitation:** Apple Health only stores workout metadata for strength training (duration, calories, HR), not exercise-level data (sets/reps/weight). Hevy fills that gap.

### 2. Hevy (workout programming)

Hevy tracks the actual exercises, sets, reps, and weights. Use the [Hevy API](https://hevy.com/api) to pull:
- Workout routines & exercise history
- Set-level data (weight × reps)
- Muscle group distribution

### 3. Apple Shortcuts Automation (optional)

Use "Find Health Samples" action to auto-push daily summaries to a webhook (Worker endpoint). This removes the manual export step for daily stats.

---

## Ingestion Flow (iPhone → Cloudflare)

Send data from iPhone to the backend. Options ranked by practicality:

### **Primary: Share-to-Webhook via Shortcut + Worker**

1. On iPhone, use HealthExportKit to generate JSON (takes ~10s once a week)
2. Tap Share → run a Shortcut that reads the file, POSTs it to `https://gym.emi.workers.dev/ingest`
3. Worker validates, extracts new workouts/body/sleep, stores in D1 + R2 (raw file)
4. Weekly, a Cron Worker pulls Hevy API for the latest workout data

**Why this wins:** Zero infrastructure to manage, no app store, works from the share sheet, Cloudflare handles everything.

### **Alternative: Dedicated minimal upload page**

A single HTML page on Cloudflare Pages with a file input + submit button. Share the JSON from HealthExportKit → Safari → choose file → upload. Slightly more steps, no Shortcut setup needed.

### **Future: Discord bot (Worker + Discord interactions)**

A Cloudflare Worker acts as a Discord bot. User DMs the export file to the bot, it parses and stores it. Also serves as the assistant chat interface.

### **Never: WhatsApp/Twilio**

Too expensive. The free tier won't last with media handling.

---

## Cloudflare Stack (All Free Tier)

| Service | Use |
|---------|-----|
| **Workers** | API endpoints, ingestion handler, Cron tasks |
| **D1** | Structured data — workouts, exercises, sets, sleep, body metrics |
| **R2** | Raw JSON/XML export blob storage (backup + re-processing) |
| **KV** | User config, sync cursors, session state |
| **Queues** | Async ingestion pipeline (unpack → parse → store) |
| **Pages** | Dashboard frontend (future) |
| **Workers AI / AI Gateway** | LLM-powered assistant (see below) |

### Monthly Free Limits Check

| Resource | Free Limit | Expected Usage |
|----------|-----------|----------------|
| Workers reqs | 100k/day | ~500/day (ingestion + chat) |
| D1 rows | 5M rows | ~50k rows (years of data) |
| D1 read units | 5B/mo | Negligible |
| R2 storage | 10 GB | <50 MB |
| R2 operations A | 10M/mo | Tiny |
| Queues | 1M ops/mo | ~100/mo |
| Workers AI | 10k neurons/day | Depends on chat volume |

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
  flights_climbed INTEGER,
  resting_hr REAL,
  hrv REAL
);

-- Apple Health workouts (metadata)
CREATE TABLE health_workouts (
  id INTEGER PRIMARY KEY,
  date TEXT,
  type TEXT,
  duration_sec INTEGER,
  active_kcal REAL,
  avg_hr REAL,
  max_hr REAL,
  distance_km REAL,
  source TEXT,
  raw_json TEXT  -- keep original payload
);

-- Hevy exercises
CREATE TABLE hevy_exercises (
  id INTEGER PRIMARY KEY,
  workout_id TEXT,             -- Hevy workout UUID
  date TEXT,
  exercise TEXT,               -- e.g. "Barbell Bench Press"
  muscle_group TEXT,
  sets INTEGER,
  reps INTEGER,
  weight_kg REAL,
  notes TEXT
);

-- Sleep sessions
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
  date TEXT,
  weight_kg REAL,
  body_fat_pct REAL,
  lean_mass_kg REAL,
  source TEXT
);

-- Sync state
CREATE TABLE sync_cursors (
  source TEXT PRIMARY KEY,
  last_sync TEXT
);
```

---

## LLM Assistant Design

### Architecture

```
User (Discord/Web UI/OpenWebUI)
  → Worker (chat endpoint)
    → Build context: recent workouts, today's health data, recovery score
    → Prompt template + RAG over workout history
    → Workers AI (or OpenAI via AI Gateway)
    → Response back to user
```

### Recovery Score (simple heuristic, done in Worker)

```
resting_hr_baseline = avg(resting_hr last 7 days)
hrv_baseline = avg(hrv last 7 days)
sleep_debt = (target_8h * 7) - sum(sleep last 7 days)
strain_48h = sum(workout_strain last 48h)  // strain = duration * avg_hr_factor

score = weighted_combination(hrv_deviation, hr_deviation, sleep_debt, strain)
→ "Green (recovered)" / "Yellow (cautious)" / "Red (rest needed)"
```

### Prompt Template

```
You are the user's personal gym assistant. You have access to their workout history, 
health data, and recovery status.

Today: {date}
Recovery: {recovery_score} — {explanation}
Last workout: {last_workout_summary}
Last 7 days sleep avg: {sleep_avg}h

Here is the workout history relevant to the user's question:
{retrieved_context}
---

Answer the user's question concisely and usefully.
```

### Where to run the LLM

| Option | Pros | Cons |
|--------|------|------|
| **Workers AI (Llama 3.x)** | Free tier, no API key, stays in CF | Smaller models, slower |
| **OpenAI via AI Gateway** | GPT-4 quality, CF caches, rate-limited | Costs $, needs API key |
| **OpenWebUI (self-hosted)** | Already have it, full control | Not accessible everywhere (home network) |

**Recommended:** Workers AI for daily use (free, good enough for fitness advice), fallback to OpenAI for complex queries.

### RAG retrieval

Since the dataset is small (single user), no need for vector embeddings. Just:
- SQL queries filtered by muscle group, date range, or exercise name
- Glue results into the prompt directly
- Total context fits well within 4k-8k tokens

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/ingest` | POST | Upload health export JSON |
| `/sync/hevy` | POST | Trigger Hevy API sync |
| `/chat` | POST | Ask the assistant |
| `/chat` | GET | SSE stream for real-time responses |
| `/api/workouts` | GET | Query workout history (for dashboard) |
| `/api/recovery` | GET | Get today's recovery score |
| `/api/stats` | GET | Aggregated stats (PRs, volume, trends) |

---

## Implementation Phases

### Phase 1 — Core (Weekend project)
- [ ] Set up Cloudflare Workers project with D1
- [ ] Create database schema + migrations
- [ ] Build `/ingest` endpoint that parses HealthExportKit JSON
- [ ] Cron Worker to pull Hevy API weekly
- [ ] Basic `/chat` endpoint with Workers AI + fixed prompt
- [ ] Discord bot (Worker + Discord Interactions API) for chatting + uploads

### Phase 2 — Polish
- [ ] Recovery score calculation
- [ ] RAG-like context assembly (fetch relevant workout history)
- [ ] Multiple chat interfaces (Discord bot + web UI)
- [ ] Stream responses via SSE for faster UX

### Phase 3 — Dashboard (Future)
- [ ] Cloudflare Pages static site
- [ ] Charts: volume over time, muscle group balance, PR progression
- [ ] Export/backup data from D1 to R2
- [ ] Optional: shareable workout summaries

---

## Deployment

```bash
# Initialize
npm create cloudflare@latest gym-assistant -- --experimental
cd gym-assistant
npx wrangler d1 create gym-data

# Set up database
npx wrangler d1 migrations create gym-data init
# ... write migration SQL

# Deploy
npx wrangler deploy
```

The Worker lives at `gym.emi.workers.dev` or a custom domain. Discord bot gets its own Worker route. The entire stack deploys with `wrangler deploy`.

---

## Edge Cases & Considerations

- **Data privacy:** All data stays in Cloudflare D1/R2. No third-party storage. If using OpenAI, route through AI Gateway.
- **Empty days:** Health data has gaps. Handle gracefully — no zero-filling, just report what's available.
- **Hevy API rate limits:** Hevy allows 1 request/5min for free. Cache aggressively, pull once daily via Cron.
- **Export format changes:** If HealthExportKit changes schema, version the JSON payload in R2 for reprocessing.
- **Multi-user?** No — single-user by design. If extending, add user_id column and auth.
- **Large exports:** The full JSON is ~1 MB. Worker can handle that inline (up to 10 MB free). Queue for bigger payloads.

---

## Original Prompt

> I'm using Apple Health + have an Apple Watch and fill my workout sessions data on Hevy. I'd love to make a custom gym assistant and maybe in the future with a dashboard showing workouts graphs/stats etc. But for now mostly the assistant is the main focus. I need to make that work on Cloudflare free tier so I can access it from anywhere. I have access to Apple Health data through a manual export once in a while or using the Health Export Kit. Apple Health export is in `data/export.zip` and unzipped in `apple_health_export`. The HealthExportKit app allows me to export in either JSON or MD; those are the 2 `health-export-*` files you can see in the `data` folder. Ideally the flow would be super simple and doable from my iPhone so I can just share one of the files (`export.zip` or JSON/MD from Kit app) to {somewhere} (a Discord bot? WhatsApp? a dedicated frontend hosted on CF Workers? through my custom OpenWebUI (self-hosted ChatGPT using OpenAI API key)? etc.)
