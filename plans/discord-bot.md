# Discord bot on Cloudflare Workers plan

## Context

- Existing backend: Cloudflare Worker in `apps/api`, Effect, D1.
- Existing data: workouts, sets, sleep, activity, body metrics.
- Goal: a Discord bot that can answer quick fitness questions and surface recent data via slash commands.

## Reference repositories

- `.references/discord-cloudflare-sample-app` — https://github.com/discord/cloudflare-sample-app
- `.references/effect-discord-bot` — https://github.com/Effect-TS/discord-bot

## Goal

Host a Discord bot as a separate Cloudflare Worker that shares the same D1 database and exposes safe, read-only slash commands.

## Architecture

Create a new worker app `apps/discord-bot` rather than bolting Discord routing onto `apps/api`. This isolates Discord-specific concerns (signature verification, command registration, interaction format) from the chat API.

The bot reuses the same D1 binding and the same `db/operations.ts` helpers as the API.

### Commands (MVP)

| Command | What it does |
|---------|--------------|
| `/summary` | Data counts (workouts, sets, sleep, body metrics, last sync). |
| `/lastworkout` | Latest Hevy session with exercises and top sets. |
| `/recovery` | Recovery label, recent sleep, last workout, recent volume. |

### Commands (later)

| Command | What it does |
|---------|--------------|
| `/progress exercise:<name>` | Exercise progress + PR. |
| `/ask question:<text>` | Async assistant answer via the chat handler (requires deferred response + webhook follow-up). |

## Tech choices

- **Worker framework:** same as API — `alchemy` + `Effect` + native `fetch`.
- **Discord verification:** Ed25519 signature check. Use `tweetnacl` or a small WebCrypto implementation; avoid pulling in heavy Discord libraries.
- **Command registration:** a one-shot script `scripts/register-commands.ts` that pushes commands to Discord’s REST API.
- **Database:** reuse existing D1 binding; share code via a new `packages/db` package or by importing `apps/api/src/db/operations.ts` if the monorepo setup allows it.

## Implementation steps

1. **Add reference repos** (done).
2. **Create `apps/discord-bot/`**:
   - `package.json` with deps: `alchemy`, `effect`, `zod`, `tweetnacl`, `@cloudflare/workers-types`.
   - `src/bot.worker.ts` entry point.
   - `wrangler.toml` or alchemy config with D1 binding.
   - `tsconfig.json` aligned with `apps/api`.
3. **Implement request verification**:
   - Read `X-Signature-Ed25519` and `X-Signature-Timestamp` headers.
   - Verify with `DISCORD_PUBLIC_KEY`.
   - Reject with `401` on failure.
4. **Implement interaction dispatcher**:
   - Parse `type` (`1` = Ping, `2` = ApplicationCommand).
   - Reply to Ping with `{ type: 1 }`.
   - Route command names to handlers.
5. **Implement command handlers** using Effect:
   - `/summary` → `getDataSummary`.
   - `/lastworkout` → `getWorkouts` (limit 1) + `getWorkoutDetails` (join sets).
   - `/recovery` → existing recovery logic or a new `getRecovery` operation.
6. **Create `scripts/register-commands.ts`**:
   - POST command definitions to `https://discord.com/api/v10/applications/{id}/commands`.
   - Read `DISCORD_APPLICATION_ID` and `DISCORD_BOT_TOKEN` from env.
7. **Add root scripts**:
   - `discord:dev`, `discord:deploy`, `discord:register`.
8. **Set secrets** (via `wrangler secret` or alchemy):
   - `DISCORD_PUBLIC_KEY`
   - `DISCORD_APPLICATION_ID`
   - `DISCORD_BOT_TOKEN`
   - D1 database binding.
9. **Deploy and wire the interactions endpoint** in the Discord developer portal to `https://<discord-bot-worker>/`.
10. **Add tests**:
   - Signature verification with known good/bad payloads.
   - Handler output shape.
11. **Run checks**: `pnpm typecheck`, `pnpm lint`, `pnpm fmt`.

## Shared code question

The cleanest path is to extract DB schema and operations into `packages/db` so both `apps/api` and `apps/discord-bot` depend on it. If that is too big a refactor for this feature, temporarily duplicate the small helpers needed by the bot and create a follow-up ticket to extract `packages/db`.

## Open questions

- Do we want guild-specific commands for faster updates or global commands? Start global; guild commands can be added for a test server.
- Should `/ask` call the chat handler directly or proxy through `apps/api`? Direct call is simpler but couples the bot to the chat pipeline; proxying avoids duplication. Defer `/ask` until the simple commands work.
- Should the bot be rate-limited? Yes, apply the same IP-based rate limiter used in `apps/api` once it exists.

## Acceptance criteria

- `/summary` returns an embed with data counts and last-sync times.
- `/lastworkout` returns the latest Hevy session with exercises and sets.
- Invalid request signatures return `401`.
- Commands are registered and visible in Discord.
- Deployed worker responds to interactions within Discord’s 3-second window.
