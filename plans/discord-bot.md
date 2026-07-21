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
  (local values live in `apps/discord-bot/.env`).
- Bind the existing D1 (`GymData`) used by `apps/api`. Migrations stay owned by the API stack —
  do **not** set `migrationsDir` on the bot’s GymData binding.
- Root scripts: `discord:dev`, `discord:deploy`, `discord:deploy:adopt`, `discord:register`.
- Start with guild commands (`DISCORD_GUILD_ID` set) for immediate test iteration; omit it to
  register global commands.

### Ship checklist (ops)

1. Cloudflare auth: `wrangler login` (or CF API token in env). Without this, dry-run cannot see
   the live GymData owned by the `emi-healthfit` API stack.
2. Apply Discord link migrations via the **API** stack (owns `migrationsDir`):
   `pnpm --filter @emi/api deploy` (or `deploy:prod` for prod). Confirms
   `discord_account_links` / `discord_link_codes` exist on GymData.
3. First Discord bot deploy against existing GymData **must adopt**, not create:
   `pnpm discord:deploy:adopt`
   Equivalent: `pnpm --filter @emi/discord-bot exec alchemy deploy --adopt`
4. Register guild commands, then promote global later:
   `DISCORD_GUILD_ID=<guild> pnpm discord:register`
5. Manual smoke: Settings → Generate link code → `/healthfit link` → data commands → unlink.

### GymData adopt — exact commands and blocker (2026-07-21)

Observed without Cloudflare login:

```text
$ pnpm --filter @emi/discord-bot dry
Plan: … [GymData] create   # FORBIDDEN against live API GymData

$ pnpm --filter @emi/discord-bot exec alchemy deploy --dry-run --adopt
Plan: … [GymData] create   # still plans create when CF auth is missing / no live read
```

`wrangler whoami` → **not authenticated**. Until CF credentials can `read` the API stack’s
GymData, dry-run cannot prove adopt will bind the shared database. **Do not** run a plain
`alchemy deploy` for the discord stack against production — that risks a second empty D1.

Once authenticated, first real deploy:

```bash
# From repo root, with apps/discord-bot/.env secrets loaded
pnpm discord:deploy:adopt
# or:
pnpm --filter @emi/discord-bot exec alchemy deploy --adopt
```

Alchemy Effect adopt semantics (beta.59 / alchemy-effect docs):

- CLI: `alchemy deploy --adopt` sets stack-wide `AdoptPolicy` so an existing **unowned**
  (foreign) resource is taken over instead of failing `OwnedBySomeoneElse`.
- Programmatic: `import { adopt } from "alchemy/AdoptPolicy"` then
  `deployEffect.pipe(adopt(true))` — must wrap the **deploy**, not the resource declaration.
- Per-resource `.pipe(adopt(true))` overrides the stack default when needed.
- Bot binding stays `Cloudflare.D1.Database("GymData")` with **no** `migrationsDir`.
- After adopt, avoid `alchemy destroy` on the discord stack until confirming destroy will not
  delete the shared GymData (prefer unbinding / `delete: false` if Alchemy grows that prop;
  current DatabaseProps in beta.59 have no `delete` flag — treat destroy as unsafe for shared D1).

**Blocker for completing ops smoke in-agent:** Cloudflare account not logged in
(`wrangler whoami` fails). Re-run the ship checklist after `wrangler login`.

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
  the API stack only. Ops smoke blocked until `wrangler login`.
