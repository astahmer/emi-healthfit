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

- Worker secrets: `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN`.
- Bind the existing D1 (`GymData`) used by `apps/api`. Migrations stay owned by the API stack.
  First Discord bot deploy against an already-created database may need Alchemy adopt for that
  binding so a second empty D1 is not created.
- Root scripts: `discord:dev`, `discord:deploy`, `discord:register`.
- Start with guild commands (`DISCORD_GUILD_ID` set) for immediate test iteration; omit it to
  register global commands.

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
