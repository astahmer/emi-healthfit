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
- **Quality:** Oxlint, Oxfmt, Knip, Vitest, Node test runner, and Playwright

## Prerequisites

- [pnpm](https://pnpm.io) 11+
- Node 26+ (for `--experimental-strip-types`)
- A Cloudflare account
- [Alchemy CLI login](https://alchemy.run/docs/getting-started) (`alchemy login`)

Alternatively, install Nix + direnv and run `direnv allow`. The checked-in flake provides Node 26,
pnpm 11, Playwright browsers, Python, and the deployment utilities used by the repository.

## Setup

```bash
pnpm install
```

### Google sign-in

Google requires the OAuth app and web client to be created in Google Cloud Console. Client creation
for consumer Sign in with Google is not exposed by the regular `gcloud` CLI, but the repository can
turn the downloaded client JSON into a complete local `.env`.

1. [Create a Google Cloud project](https://console.cloud.google.com/projectcreate), or select a
   dedicated existing project. Keep development and production in separate projects if this app
   will eventually serve users beyond you.
2. Open [Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding), click
   **Get started** if prompted, and enter:
   - **App name:** `Emi HealthFit`
   - **User support email:** an address you monitor
   - **Developer contact information:** an address you monitor
3. Open [Audience](https://console.cloud.google.com/auth/audience):
   - Choose **Internal** only when every allowed account belongs to your Google Workspace
     organization. Otherwise choose **External** and leave the app in **Testing** for personal use.
   - Under **Test users**, add the same Google address that you will put in `ALLOWED_EMAILS` if the
     console offers this section. Google currently exempts basic `openid`, `email`, and `profile`
     sign-in from the test-user restriction, but keeping both allowlists aligned avoids surprises if
     scopes change later.
4. Open [Clients](https://console.cloud.google.com/auth/clients), click **Create client**, choose
   **Web application**, and name it `Emi HealthFit local`.
5. Leave **Authorized JavaScript origins** empty. Under **Authorized redirect URIs**, add exactly:

   ```text
   http://localhost:1337/api/auth/callback/google
   ```

   Scheme, host, port, path, case, and trailing slash must match exactly. Google permits HTTP only
   for localhost; deployed callbacks must use HTTPS.

6. Click **Create**, open the new client, and click **Download JSON**. Do not commit or share this
   file; it contains the client secret.
7. From the repository root, create `.env` from that download. Replace the path and email:

   ```bash
   pnpm setup:google -- ~/Downloads/client_secret_....json you@example.com
   ```

   The command checks the callback URI, imports the client ID and secret, generates a random
   256-bit `BETTER_AUTH_SECRET`, lowercases the allowed email, and creates `.env` with owner-only
   permissions. It refuses to overwrite an existing `.env`.

8. Run `pnpm dev`, open the printed local URL, select **Continue with Google**, and verify that the
   allowed account reaches the app. A different account must be denied.

The callback is handled server-side by Better Auth, so no JavaScript origin is needed. Sign-in asks
only for basic identity (`openid`, `email`, and `profile`); Calendar scopes are intentionally not
requested. `ALLOWED_EMAILS` is a second, application-level enrollment and active-session allowlist.
Rows are authorized by Better Auth user id, so multiple verified allowlisted accounts are supported
after the ownership rollout below. Removing an email blocks its existing sessions on the next request.

For a manual setup instead, copy `.env.example` to `.env`, generate at least 32 random bytes for
`BETTER_AUTH_SECRET`, then fill in the client ID, client secret, base URL, and allowed email.

For preview or production, create a separate web client in that environment's Google Cloud project,
register `https://<your-worker-host>/api/auth/callback/google`, download its JSON, back up or remove
the local `.env`, and run with the real deployed origin, for example:

```bash
pnpm setup:google -- path/to/client.json you@example.com https://emi-healthfit.example.workers.dev
```

Use the same origin for `BETTER_AUTH_URL`; do not include a trailing slash. See Google's official
[web OAuth client setup](https://developers.google.com/workspace/guides/create-credentials#web-client),
[OpenID Connect setup](https://developers.google.com/identity/openid-connect/openid-connect#settingup),
and [redirect URI rules](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation).

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

Quality and production checks:

```bash
pnpm lint
pnpm typecheck
pnpm knip
pnpm build
```

## Deployment

Alchemy stages are isolated environments. A bare `alchemy deploy` uses the default personal stage
(`dev_<username>`); it still creates real public Cloudflare resources, but it does not deploy the
`prod` stage. Production must always be selected explicitly with `--stage prod`. Each stage owns a
separate Worker, D1 database, R2 bucket, AI Gateway, secrets, and Alchemy state.

Alchemy is the only deployment authority for this project. Do not use Wrangler to deploy or destroy
the Worker, apply migrations, change bindings, or otherwise manage resources tracked by Alchemy.
Wrangler is reserved for operational work such as log tailing, read-only D1/R2 inspection, exports,
and documented diagnostics. Keep operational writes behind repository scripts or an explicit
runbook so Alchemy state and Cloudflare state cannot drift.

Create `.env.prod` with production values for every variable in `.env.example`:

- `BETTER_AUTH_URL` is the exact public HTTPS Worker origin, without a trailing slash.
- The Google production web client must authorize
  `<BETTER_AUTH_URL>/api/auth/callback/google` exactly.
- Use a different `BETTER_AUTH_SECRET` from local development. A separate Google client is preferred;
  a personal deployment may reuse one client only when both local and production callback URIs are
  registered explicitly.
- `ALLOWED_EMAILS` accepts a comma-separated list. Keep exactly one address through the legacy-data
  migration, then add accounts only after the isolation smoke test passes.

Build the frontend and deploy the production stage:

```bash
pnpm build
pnpm deploy -- --stage prod --env-file ../../.env.prod
```

The filtered `api` script runs from `apps/api`, so `../../.env.prod` points to the repository root.
`Config.redacted` reads these values at deploy time and Alchemy binds them as encrypted Worker
secrets; the `.env.prod` file itself is not uploaded. A redeploy updates the bindings. In CI, pass
the same names through the job environment instead of creating a file.

Alchemy will create/update:

- `GymData` D1 database
- `Exports` R2 bucket
- `AiGateway` AI Gateway
- `Api` Worker with bindings to the above and the built frontend assets

The command prints the deployed Worker URL. Open that URL in a browser to use the chat UI.

On the first production deployment, the generated Worker origin does not exist until Alchemy creates
the stage. After that bootstrap deploy:

1. Copy the printed HTTPS Worker origin into `BETTER_AUTH_URL` in `.env.prod`, without a trailing slash.
2. Register `<BETTER_AUTH_URL>/api/auth/callback/google` on the matching Google OAuth web client.
3. Redeploy the same `prod` stage with `.env.prod` before testing sign-in.

Never assume a successful bare deployment updated production. Confirm both the stage and env file in
the command before approving an Alchemy plan.

### Database migration workflow

Drizzle schema files are the source of truth for database structure. Make schema changes there, then
generate and validate migration artifacts:

```bash
pnpm --filter @emi/api db:generate
pnpm --filter @emi/api db:check
```

Do not create, edit, rename, move, or delete migration SQL, journals, or snapshots manually. Generated
SQL should be reviewed and tested but not hand-modified. If a required backfill does not fit the
established Drizzle workflow, stop and design an explicit migration process before deployment.

### Ownership migration rollout

1. Back up production D1 and the `Exports` R2 bucket, then confirm the legacy owner has signed in,
   creating exactly one `auth_user` row. Do not enroll a second account yet.
2. Set `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `D1_DATABASE_ID`, then run
   `pnpm --filter @emi/api db:ownership:review`. Review every printed count and type the displayed
   owner id. This read-only command gates operator approval before deployment.
3. Deploy the production stage. The migration aborts when personal rows exist without exactly one
   auth user, backfills all legacy rows to that stable user id, rebuilds natural keys for per-user
   data, and installs owner indexes and write guards.
4. Confirm every personal table has zero null `user_id` values and reviewed row counts are
   unchanged. Sign in as the legacy owner and verify chat, workouts, notes, memories, analytics,
   resume, import, and export.
5. In R2, move any legacy `health/` and `hevy/` objects under `<owner-id>/health/` and
   `<owner-id>/hevy/`, or delete them after verifying the backup. Confirm no unscoped legacy prefix
   remains; new uploads already use user-id prefixes.
6. Add a second email to `ALLOWED_EMAILS`, redeploy, and confirm both users see separate datasets
   and guessed conversation ids return not found. Keep the backups until both accounts pass.

## Using the assistant

The web UI is served directly from the Worker at the root URL after deploying. Its main areas are:

- **Chat** — streaming, resumable chat with tools, attachments, conversation history, and branches
- **Upload** — import HealthExportKit JSON and/or Hevy CSV
- **Workouts** — browse and filter imported Hevy sessions
- **Trends** — activity, body, sleep, training-load, and exercise analytics
- **Notes** — a gym journal that can be included in assistant context
- **Memory** — saved assistant snippets and extracted memories
- **Settings** — model/provider options, JSON export/restore, raw-upload retention, and selective
  Apple Health or Hevy deletion

The development-only **Sandbox** exercises generative UI components and six fake-data threading
layouts at `/gen-ui/thread-layouts`. Those layouts are prototypes, not production chat modes.

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

`GET /api/export/ingested-data/summary` returns record counts and Health/Hevy date ranges before a
large download. `POST /api/import/ingested-data` previews duplicate/new counts by default; add
`?apply=true` only after the preview is confirmed.

### `GET /api/analytics/overview`

Returns the normalized activity, recovery, body, training-load, and exercise series used by the
Trends page. Use `?days=<n>` to bound the window.

### `GET/PATCH /api/privacy`

Reads or updates raw-upload retention. Updating the policy immediately removes expired R2 objects,
and future ingestion enforces the same policy. `DELETE /api/privacy/data/health` and
`DELETE /api/privacy/data/hevy` selectively remove parsed records, sync cursors, and raw uploads.

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
├── flake.nix / .envrc          # Reproducible Nix + direnv development shell
├── knip.json                   # Monorepo dead-code/dependency analysis
├── plans/                      # Detailed implementation and UX plans
├── ideas.md                    # Product and engineering backlog
├── improvements.md             # Prioritized post-audit improvement ideas
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
pnpm lint
pnpm typecheck
pnpm fmt
pnpm knip
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
   pnpm lint
   pnpm format
   pnpm knip
   pnpm dry        # alchemy deploy --dry-run
   ```
4. Use `jj status` and `jj diff` to review the result, split unrelated work into focused revisions,
   and describe every revision before opening a PR or pushing to the jj repository.

Code style:

- Name effectful operations with `Effect.fn`, compose with `Effect.gen`, and log with `Effect.log*`
- Prefer Alchemy bindings over raw `fetch`
- Keep parsers tolerant of missing/optional fields
- Add tests for new parsers or endpoints

## License

Apache-2.0
