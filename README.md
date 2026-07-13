# Emi HealthFit — Personal Gym Assistant

A personal gym assistant powered by **Apple Health** + **Hevy** data, running on **Cloudflare Workers** with **Effect 4** and **Alchemy** (Infrastructure-as-Effects).

It answers questions like "what should I train today?", "am I recovered enough?", or "how's my squat progress?" by combining your recent workouts, sleep, activity, and a lightweight recovery score.

## Stack

- **Runtime:** Cloudflare Workers
- **Language:** TypeScript 7
- **Infra + runtime framework:** [Alchemy](https://alchemy.run) + [Effect](https://effect.website)
- **Database:** Cloudflare D1
- **Raw export storage:** Cloudflare R2
- **LLM:** Workers AI (`@cf/meta/llama-3.1-8b-instruct`) by default; OpenAI (`gpt-4o-mini`) optional

## Prerequisites

- [pnpm](https://pnpm.io) 11+
- Node 26+ (for `--experimental-strip-types`)
- A Cloudflare account
- [Alchemy CLI login](https://alchemy.run/docs/getting-started) (`alchemy login`)

## Setup

```bash
pnpm install
```

On first install pnpm may ask you to approve native builds for `workerd` and `msgpackr-extract`. Approve them — they are used by Alchemy for local dev.

## Environment variables

Set these via the Cloudflare dashboard or `wrangler secret` after deploying:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_PROVIDER` | no | `workers-ai` | `workers-ai` or `openai` |
| `WORKERS_AI_MODEL` | no | `@cf/meta/llama-3.1-8b-instruct` | Workers AI model endpoint |
| `OPENAI_MODEL` | no | `gpt-4o-mini` | OpenAI chat model |
| `OPENAI_API_KEY` | only if `LLM_PROVIDER=openai` | — | OpenAI API key |

## Local development

Run the Worker locally with Alchemy’s dev server:

```bash
pnpm dev
```

This provisions a temporary local stack (D1, R2, AI Gateway bindings) and gives you a local URL.

To type-check the project:

```bash
pnpm typecheck
```

To run the parser smoke tests against the real data files:

```bash
pnpm test
```

To quickly verify parsing without a server:

```bash
pnpm verify
```

## Deployment

```bash
pnpm deploy
```

Alchemy will create/update:

- `GymData` D1 database
- `Exports` R2 bucket
- `AiGateway` AI Gateway
- `Api` Worker with bindings to the above

The command prints the deployed Worker URL. Open that URL in a browser to use the built-in upload + chat UI.

## Using the assistant

For a non-technical, step-by-step guide (iPhone exports, web UI, OpenWebUI, Shortcuts), see [`docs/USER_GUIDE.md`](./docs/USER_GUIDE.md).

The web UI is served directly from the Worker at the root URL after deploying.

## API

### `POST /ingest`

Upload a HealthExportKit JSON export and/or a Hevy CSV export. Files are parsed, upserted into D1, and the raw blobs are stored in R2.

```bash
curl -X POST https://<worker-url>/ingest \
  -F "health_export=@health-export-json-2022-01-01-0000_to_2026-07-13-1526.json" \
  -F "hevy_export=@workout_data.csv"
```

Response:

```json
{
  "health": { "daily": 1655, "workouts": 572, "sleep": 918, "body": 158 },
  "hevy": { "sessions": 110, "sets": 1840 }
}
```

### `POST /chat`

Ask the assistant anything.

```bash
curl -X POST https://<worker-url>/chat \
  -H "content-type: application/json" \
  -d '{"message":"what should I train today?"}'
```

Response:

```json
{
  "response": "...",
  "recoveryLabel": "Ready",
  "model": "@cf/meta/llama-3.1-8b-instruct"
}
```

### `GET /api/recovery`

Get today’s recovery score and supporting stats.

```bash
curl https://<worker-url>/api/recovery
```

Response:

```json
{
  "today": "2026-07-13",
  "label": "Ready",
  "explanation": "Sleep avg 7h 45m last 7 days, strain 48h 1234 kg·reps.",
  "lastWorkout": "Afternoon workout 💪 on 2026-07-12",
  "sleepAverageHours": 7.75,
  "recentWorkoutCount": 4,
  "recentVolume": 12345
}
```

## Ingestion flow from iPhone

The recommended flow is a single iOS Shortcut:

1. Export HealthExportKit JSON from the HealthExportKit app.
2. Export `workout_data.csv` from Hevy: Profile → Settings → Export & Import Data → Export Workouts.
3. Run a Shortcut that collects both files and `POST`s them as multipart form data to `/ingest`.

Shortcut actions:

- **Receive** files
- **Get contents of URL** — `POST` to `https://<worker-url>/ingest` with the two files as form fields named `health_export` and `hevy_export`

No dedicated app needed.

## Project structure

```
.
├── alchemy.run.ts              # Alchemy stack: D1, R2, AI Gateway, Worker
├── migrations/0001_init.sql    # D1 schema
├── src/
│   ├── api.worker.ts           # Worker routes and bindings
│   ├── chat/
│   │   ├── context.ts          # Recovery score + prompt context
│   │   └── handler.ts          # LLM routing (Workers AI / OpenAI)
│   ├── db/
│   │   ├── operations.ts       # D1 batch inserts/upserts
│   │   └── schema.ts           # Row type definitions
│   └── ingest/
│       ├── health.ts           # HealthExportKit JSON parser
│       └── hevy.ts             # Hevy CSV parser
├── test/
│   └── ingest.test.ts          # Parser tests against real data
├── scripts/
│   └── verify-parsers.ts       # Standalone parser smoke test
└── data/                       # Your export files (gitignored)
```

## Recovery score

The recovery label is computed from the last 7 days of data:

- Sleep average vs. an 8-hour target
- Recent training strain (weight × reps over the last 48 hours)
- Average active calories

It returns one of:

- `Ready`
- `Caution`
- `Rest needed`

## Testing

Tests run against the real export files in `data/` and assert parser correctness.

```bash
pnpm test
```

To add a new test, create a `.test.ts` file under `test/` and run it with `node --test --experimental-strip-types`.

## Contributing

1. Install dependencies: `pnpm install`
2. Make changes
3. Run checks:
   ```bash
   pnpm typecheck
   pnpm test
   pnpm dry        # alchemy deploy --dry-run
   ```
4. Open a PR or push to your jj repo

Code style:

- Use Effect generators (`Effect.gen`) for async/ effectful code
- Prefer Alchemy bindings over raw `fetch`
- Keep parsers tolerant of missing/optional fields
- Add tests for new parsers or endpoints

## License

Apache-2.0
