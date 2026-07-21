# Discord bot on Cloudflare Workers plan

## Current architecture

- Auth and per-user ownership are implemented. Discord identities must link explicitly to an
  application user; never infer ownership from email or guild.
- Shared domain reads live in `@emi/flavor-healthfit`. Conversation/auth ports live in
  `@emi/core/server`. Discord verify/DTO helpers live in `@emi/core/discord`.
- `apps/discord-bot` is a thin Alchemy Worker. Skeleton MVP shipped: signature verification, Ping,
  `/healthfit` dispatch with fail-closed “not linked” stubs, boundary tests, dry-run deploy.

## Goal

Provide a separate Cloudflare Worker for fast, safe Discord slash commands, linked explicitly to an
authenticated Emi HealthFit account. Start read-only; defer free-form assistant chat until identity,
cost, and durable follow-up behavior are proven.

## Architecture

- `apps/discord-bot` with its own Alchemy Worker and least-privilege binding to the shared D1.
- Health calculations and owner-scoped queries stay in `@emi/flavor-healthfit` / `@emi/core/server`.
- Discord signature verification and interaction DTOs live in `@emi/core/discord` (reusable
  subpath; no React / no flavor imports).
- Link Discord users through a short-lived one-time code generated in authenticated Settings. Store
  `discord_user_id -> application_user_id`; never infer ownership from a Discord email or guild.

## MVP commands

| Command | Behavior |
| --- | --- |
| `/healthfit link code:<code>` | Links the invoking Discord identity to the signed-in app account. |
| `/healthfit summary` | Returns recent activity, training, sleep, and sync freshness. |
| `/healthfit last-workout` | Returns the latest Hevy session and concise exercise totals. |
| `/healthfit recovery` | Returns the existing bounded recovery summary. |
| `/healthfit unlink` | Removes the Discord identity mapping and active bot state. |

Use ephemeral responses by default because health data is sensitive. A user may explicitly opt into
visible responses per command later.

## Implementation status

1. Land auth/user ownership. **DONE**
2. Owner-scoped Effect operations in shared packages (not `apps/api` source). **DONE**
   (via `@emi/core/server` + `@emi/flavor-healthfit`; no separate `packages/data-access`).
3. `discord_account_links` + `discord_link_codes` migrations. **DONE**
4. Scaffold `apps/discord-bot`. **DONE**
5. Verify Ed25519 signature + timestamp before JSON parse. **DONE** (`@emi/core/discord`)
6. Decode interactions with Effect Schema, Ping, dispatch. **DONE**
7. Resolve Discord user link before every data command. **DONE**
8. Registration script (guild preview / global prod). **DONE** (`pnpm discord:register`)
9. Settings UI for link codes. **DONE**
10. Per-user rate limits and response-size limits. **DONE**

## Deferred `/ask`

Do not call the current chat handler directly in MVP. `/ask` needs:

- deferred interaction acknowledgement within Discord’s deadline;
- a dedicated Discord conversation or explicit target conversation, never accidental reuse of the
  last web session;
- the same durable-generation ownership and stale-lease recovery as web chat;
- per-user model/token budgets and a maximum cost per command;
- webhook follow-up handling that survives Worker termination;
- content controls for public guild channels.

Proxy through a stable authenticated internal API or shared generation service when those contracts
exist. Do not duplicate the chat pipeline in the bot.

## Secrets and deployment

- Worker secrets: `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN`
  (local values live in `apps/discord-bot/.env` — already scaffolded; do **not** commit).
- Bind the existing D1 (`GymData`) used by `apps/api`. Migrations stay owned by the API stack —
  do **not** set `migrationsDir` on the bot’s GymData binding.
- Root scripts: `discord:dev`, `discord:deploy`, `discord:deploy:adopt`, `discord:register`,
  `discord:setup:check`.
- Start with guild commands (`DISCORD_GUILD_ID` set) for immediate test iteration; omit it to
  register global commands.

### Zero → smoke (Alchemy-first, no wrangler)

You do **not** need `wrangler login`. Alchemy owns Cloudflare auth for this repo.

#### 0. Prerequisites you can do by hand (or ask an agent to guide)

1. Cloudflare account that already owns the Emi API / `GymData` stack.
2. A Discord account + a **test guild** (server) you administer. Create one free at
   https://discord.com → **+** → **Create My Own** → **For me and my friends**.
3. Discord Developer Application:
   - https://discord.com/developers/applications → **New Application** → name it.
   - **Bot** → **Reset Token** → copy into `apps/discord-bot/.env` as `DISCORD_BOT_TOKEN`.
   - **General Information** → copy **Application ID** → `DISCORD_APPLICATION_ID`.
   - **General Information** → copy **Public Key** → `DISCORD_PUBLIC_KEY`.
   - **Bot** → enable **Message Content Intent** only if you later ship free-form `/ask`
     that reads message text outside slash options (MVP slash options do not need it).
4. Invite the bot to your guild:
   - Developer Portal → **OAuth2** → **URL Generator**
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: none required for ephemeral slash replies (or `Send Messages` if you
     later post non-ephemeral follow-ups)
   - Open the generated URL, pick your test guild, authorize.
5. Copy guild id: Discord user settings → Advanced → Developer Mode → right-click guild
   → Copy Server ID → use as `DISCORD_GUILD_ID` when registering.

#### 1. Alchemy Cloudflare login (interactive, once)

From repo root (or `apps/discord-bot`):

```bash
pnpm --filter @emi/discord-bot exec alchemy login
# or first deploy will prompt interactively:
pnpm --filter @emi/discord-bot dry:adopt
```

Alchemy stores the Cloudflare profile under `~/.alchemy/profiles.json` (OAuth or API token).
CI alternative: set `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` and `CI=1`.

Validate local secrets without deploying:

```bash
pnpm discord:setup:check
```

#### 2. Apply Discord link tables via the **API** stack

Migrations for `discord_account_links` / `discord_link_codes` live on `apps/api` (`GymData`):

```bash
pnpm --filter @emi/api deploy   # or deploy:prod
```

#### 3. First Discord bot deploy — **must adopt** GymData

**Do not** run plain `pnpm discord:deploy` the first time against the live API database.
That can plan `[GymData] create` (a second empty D1). Always:

```bash
pnpm discord:deploy:adopt
# equivalent:
pnpm --filter @emi/discord-bot exec alchemy deploy --adopt
```

Confirm dry-run first:

```bash
pnpm --filter @emi/discord-bot dry:adopt
# Plan should show GymData as adopt/update — never create — once Alchemy can read CF state.
```

After deploy, copy the Worker URL from Alchemy output into Discord Developer Portal →
**General Information** → **Interactions Endpoint URL**:
`https://<worker-host>/interactions` (path matches the bot router).

#### 4. Register guild slash commands

```bash
# loads apps/discord-bot/.env if you export it, or pass env inline:
set -a && source apps/discord-bot/.env && set +a
DISCORD_GUILD_ID=<your-guild-id> pnpm discord:register
```

Guild commands appear in seconds. Omit `DISCORD_GUILD_ID` only when promoting **global**
commands (can take up to ~1 hour).

#### 5. Manual smoke

1. Run chat app → Settings → Discord → Generate link code.
2. In the test guild: `/healthfit link code:<code>`
3. `/healthfit summary` | `last-workout` | `recovery` → ephemeral owner-scoped data.
4. `/healthfit unlink` → data commands fail closed again.

### Agent-automatable vs human-only

| Step | Agent can do | Human must do |
| --- | --- | --- |
| Write/update `.env` keys once pasted | yes | create Discord app + copy secrets |
| `alchemy login` / deploy / adopt / register | yes if CF profile or token in env | first interactive OAuth if no token |
| Create Discord guild + invite bot | no (browser) | yes |
| Paste Interactions Endpoint URL | no (portal) | yes after deploy prints URL |
| Settings link-code smoke | drive browser e2e if app up | Discord client slash commands |

### GymData adopt — exact commands and blocker notes

Observed without Cloudflare credentials in Alchemy profile:

```text
$ pnpm --filter @emi/discord-bot dry
Plan: … [GymData] create   # FORBIDDEN against live API GymData

$ pnpm --filter @emi/discord-bot exec alchemy deploy --dry-run --adopt
Plan: … [GymData] create   # still plans create when CF auth cannot read live state
```

Until `alchemy login` (or `CLOUDFLARE_API_TOKEN`) can **read** the API stack’s GymData,
dry-run cannot prove adopt will bind the shared database. **Do not** ship a plain
`alchemy deploy` for the discord stack against production.

Alchemy Effect adopt semantics (beta.59):

- CLI: `alchemy deploy --adopt` sets stack-wide `AdoptPolicy` so an existing **unowned**
  (foreign) resource is taken over instead of failing `OwnedBySomeoneElse`.
- Bot binding stays `Cloudflare.D1.Database("GymData")` with **no** `migrationsDir`.
- After adopt, avoid `alchemy destroy` on the discord stack until confirming destroy will not
  delete the shared GymData.

**Plain `alchemy deploy` is not “just work” for the first bot ship** — use
`pnpm discord:deploy:adopt`. Subsequent deploys (same Alchemy state) can use
`pnpm discord:deploy` once GymData is already adopted in that stack’s state.

## Tests

- Known valid/invalid signatures, modified bodies, missing headers, and stale timestamps.
- Interaction schema and Ping response.
- Link-code expiry, one-time consumption, collision resistance, unlink, and cross-user isolation.
- Every data command returns ephemeral output and uses the linked owner id.
- Registration snapshot and response-length limits.
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm fmt`, and Knip.

## Acceptance criteria

- Invalid or replayed interaction requests return `401` before parsing or database access.
- Unlinked Discord users cannot query any health data.
- MVP responses are ephemeral and owner-scoped.
- The bot shares tested domain/data-access code without importing from `apps/api/src`.
- The bot Worker has no R2, provider-key, or AI Gateway access in MVP.
- `/ask` remains unavailable until durable, budgeted follow-ups meet the deferred checklist.

## Decisions log

- 2026-07-15: auth and ownership are prerequisites.
- 2026-07-15: account linking uses one-time codes from authenticated Settings.
- 2026-07-15: read-only commands ship before assistant chat; responses default to ephemeral.
- 2026-07-21: Discord transport lives at `@emi/core/discord` subpath (not a separate package).
- 2026-07-21: reusable core unified as `@emi/core` with contract/server/web/cloudflare/discord exports.
- 2026-07-21: First discord-bot deploy against API-owned GymData requires
  `alchemy deploy --adopt` (`pnpm discord:deploy:adopt`). Plain dry-run still plans
  `[GymData] create` when CF auth is missing — do not ship that create. Migrations stay on
  the API stack only. Ops auth is **Alchemy** (`alchemy login` / `CLOUDFLARE_API_TOKEN`),
  not wrangler. See Zero→smoke checklist above.
