# Emi HealthFit — Personal Gym Assistant

A personal gym assistant powered by **Apple Health** + **Hevy** data, running on **Cloudflare Workers** with **Effect 4**, **Alchemy**, and a new **assistant-ui** chat frontend.

It answers questions like "what should I train today?", "am I recovered enough?", or "how's my squat progress?" by combining your recent workouts, sleep, activity, and a lightweight recovery score. The chat UI supports OpenAI (BYOK), GPT-compatible endpoints, and remote tools exposed by the CF Worker.

## Stack

- **Runtime:** Cloudflare Workers
- **Language:** TypeScript 7
- **Infra + runtime framework:** [Alchemy](https://alchemy.run) + [Effect](https://effect.website)
- **Frontend:** [assistant-ui](https://github.com/assistant-ui/assistant-ui) (Next.js, static export)
- **Database:** Cloudflare D1
- **Raw export storage:** Cloudflare R2
- **LLM:** OpenAI (`gpt-4o-mini` by default) via BYOK or CF Worker proxy

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

## Local development

Run the Worker locally with Alchemy's dev server:

```bash
pnpm dev
```

This provisions a temporary local stack (D1, R2, AI Gateway bindings) and gives you a local URL.

To work on the chat UI with hot reload:

```bash
pnpm chat:dev
```

To type-check the whole monorepo:

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

Build the frontend and deploy the worker:

```bash
pnpm build
pnpm deploy
```

Alchemy will create/update:

- `GymData` D1 database
- `Exports` R2 bucket
- `AiGateway` AI Gateway
- `Api` Worker with bindings to the above and the built frontend assets

The command prints the deployed Worker URL. Open that URL in a browser to use the chat UI.

## Using the assistant

The web UI is served directly from the Worker at the root URL after deploying. It has four tabs:

- **Chat** — GPT-like chat with tool calling
- **Upload** — import HealthExportKit JSON and/or Hevy CSV
- **Summary** — imported data counts and last sync times
- **Settings** — provider, model, base URL, API key, system prompt

In **Settings** you can choose:

- **Proxy via CF Worker** — chat requests go to `POST /api/chat`; the Worker calls OpenAI with your API key and can execute tools.
- **Direct to provider** — the browser calls OpenAI directly with your key. Tools still run against the Worker.

Add new tools remotely by updating the Worker; the frontend discovers them from `GET /api/tools`.

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

### `POST /api/chat`

Streaming chat endpoint used by the assistant-ui frontend.

```bash
curl -X POST https://<worker-url>/api/chat \
  -H "content-type: application/json" \
  -d '{
    "messages": [{"role":"user","content":"what should I train today?"}],
    "config": {"provider":"openai","apiKey":"sk-...","model":"gpt-4o-mini"}
  }'
```

### `GET /api/tools`

List available remote tools.

### `POST /api/tools/:name`

Execute a remote tool.

### `GET /api/recovery`

Get today's recovery score and supporting stats.

```bash
curl https://<worker-url>/api/recovery
```

### `GET /api/summary`

Get imported data counts and last sync times.

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
├── apps/
│   ├── api/                    # Cloudflare Worker (Effect + Alchemy)
│   │   ├── alchemy.run.ts      # Alchemy stack: D1, R2, AI Gateway, Worker
│   │   ├── src/
│   │   │   ├── api.worker.ts   # Worker routes and bindings
│   │   │   ├── chat/           # Chat handlers (legacy + AI SDK)
│   │   │   ├── db/             # D1 operations and schema
│   │   │   ├── ingest/         # Health/Hevy parsers
│   │   │   └── tools/          # Remote tool definitions
│   │   ├── migrations/         # D1 schema
│   │   ├── test/               # Parser tests
│   │   └── scripts/            # Standalone parser smoke test
│   └── chat/                   # assistant-ui Next.js frontend
│       ├── app/                # Pages, providers, settings, tool loader
│       └── components/         # UI components
├── data/                       # Your export files (gitignored)
└── .references/                # Cloned reference repositories
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

To add a new test, create a `.test.ts` file under `apps/api/test/` and run it with `node --test --experimental-strip-types`.

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

- Use Effect generators (`Effect.gen`) for async/effectful code
- Prefer Alchemy bindings over raw `fetch`
- Keep parsers tolerant of missing/optional fields
- Add tests for new parsers or endpoints

## License

Apache-2.0
