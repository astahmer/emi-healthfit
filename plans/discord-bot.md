# Discord bot on Cloudflare Workers plan

## Current architecture

- The API Worker already owns Effect-based database operations for analytics, workouts, notes,
  memories, conversation threads, and durable generations.
- The monorepo uses pnpm workspaces/catalogs, TypeScript 7, Alchemy, Oxlint, and Oxfmt.
- Authentication and per-user ownership are planned but not implemented. A Discord identity must not
  implicitly receive access to the current single-user dataset.

## Goal

Provide a separate Cloudflare Worker for fast, safe Discord slash commands, linked explicitly to an
authenticated Emi HealthFit account. Start read-only; defer free-form assistant chat until identity,
cost, and durable follow-up behavior are proven.

## Architecture

- Create `apps/discord-bot` with its own Alchemy Worker and least-privilege binding to the shared D1.
- Extract provider-neutral data access and domain summaries from `apps/api` into a workspace package
  before reuse. Do not import through another app’s source tree and do not duplicate SQL.
- Keep Discord signature verification/interaction DTOs in the bot app. Keep health calculations and
  owner-scoped queries in shared packages.
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

## Implementation steps

1. Land auth/user ownership first.
2. Extract `packages/data-access` with owner-scoped Effect operations and schemas; keep Worker/R2/AI
   bindings in their apps.
3. Add `discord_account_links` and single-use `discord_link_codes` migrations with hashed codes,
   expiry, consumed timestamp, and user indexes.
4. Scaffold `apps/discord-bot` using catalog dependencies and the existing Nix/pnpm toolchain.
5. Verify `X-Signature-Ed25519` and `X-Signature-Timestamp` against the exact raw body before JSON
   parsing. Reject stale timestamps and invalid signatures with `401`.
6. Decode interactions with Effect Schema, handle Ping, and dispatch only registered commands.
7. Resolve the Discord user link before every data command and pass the application user id into
   shared operations.
8. Add an Effect-based registration script for guild commands in preview and global commands in
   production. Use `Effect.log*`; redact tokens and interaction payload fields containing user data.
9. Add Settings UI to create/revoke link codes and show linked Discord identities.
10. Add per-user command rate limits and response-size limits.

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
- Bind the existing D1 with least privilege available in the deployment model; do not bind R2 or AI
  Gateway for the read-only MVP.
- Add `discord:dev`, `discord:deploy`, and `discord:register` root scripts.
- Start with guild commands for immediate test iteration; promote the reviewed definitions globally.

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
