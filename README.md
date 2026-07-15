# Emi HealthFit — Personal Gym Assistant

A personal gym assistant powered by **Apple Health** + **Hevy** data, running on **Cloudflare Workers** with **Effect 4**, **Alchemy**, and an XState-driven chat frontend.

It answers questions like "what should I train today?", "am I recovered enough?", or "how's my squat progress?" by combining your recent workouts, sleep, activity, and a lightweight recovery score. The chat UI supports OpenAI (BYOK), GPT-compatible endpoints, and remote tools exposed by the CF Worker.

## Stack

- **Runtime:** Cloudflare Workers
- **Language:** TypeScript 7
- **Infra + runtime framework:** [Alchemy](https://alchemy.run) + [Effect](https://effect.website)
- **Frontend:** Next.js static export, XState chat runtime, Vercel AI SDK transport, shadcn UI
- **Database:** Cloudflare D1
- **Raw export storage:** Cloudflare R2
- **LLM:** OpenAI (`gpt-5.2-chat-latest` by default) via BYOK through the Worker

## Prerequisites

- [pnpm](https://pnpm.io) 11+
- Node 26+ (for `--experimental-strip-types`)
- A Cloudflare account
- [Alchemy CLI login](https://alchemy.run/docs/getting-started) (`alchemy login`)

## Setup

```bash
pnpm install
```

With Nix and direnv installed, approve the repository once and the complete Node 26, pnpm 11,
Playwright, Python, and utility toolchain loads automatically on entry:

```bash
direnv allow
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

The web UI is served directly from the Worker at the root URL after deploying. Its main areas are:

- **Chat** — streaming, resumable chat with tools, attachments, conversation history, and branches
- **Upload** — import HealthExportKit JSON and/or Hevy CSV
- **Workouts** — browse and filter imported Hevy sessions
- **Notes** — a gym journal that can be included in assistant context
- **Memory** — saved assistant snippets and extracted memories
- **Settings** — model, endpoint, API key, system prompt, syncing, and JSON data export

The development-only **Sandbox** exercises generative UI components.

Chat requests go to `POST /api/chat`. The Worker calls the configured GPT-compatible endpoint, executes fitness and conversation tools, and persists the conversation in D1. Images can be attached with the paperclip or pasted directly into the composer.

Conversations support rename, search, message editing/regeneration, Markdown copy/download, share links, and side-thread creation from any persisted message. Branch controls stay hidden until a conversation actually has a branch.

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

Resumable streaming chat endpoint. Generation chunks are checkpointed in D1 and can be replayed from `GET /api/chat/:conversationId/stream` after a refresh or disconnect.

```bash
curl -X POST https://<worker-url>/api/chat \
  -H "content-type: application/json" \
  -d '{
    "messages": [{"id":"user-1","role":"user","parts":[{"type":"text","text":"what should I train today?"}]}],
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

### `GET /api/export/ingested-data`

Download a versioned JSON document containing all ingested Apple Health records, Hevy sessions and sets, and sync cursors. The same export is available from **Settings**. Chat messages, notes, memories, and generation checkpoints are intentionally excluded.

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
│   └── chat/                   # XState + Next.js chat frontend
│       ├── app/                # Pages, runtime machine, providers, settings
│       └── components/         # UI components
├── data/                       # Your export files (gitignored)
├── plans/                      # Detailed implementation and UX plans
├── ideas.md                    # Product and engineering backlog
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

The API uses Node's test runner; the chat app uses Vitest and Testing Library. Parser tests exercise real export files in `data/` when available.

```bash
pnpm test
```

For focused checks, run the relevant package directly:

```bash
cd apps/api && pnpm typecheck && pnpm test
cd apps/chat && pnpm typecheck && pnpm test
```

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

- Name effectful operations with `Effect.fn`, compose with `Effect.gen`, and log with `Effect.log*`
- Prefer Alchemy bindings over raw `fetch`
- Keep parsers tolerant of missing/optional fields
- Add tests for new parsers or endpoints

## License

Apache-2.0
