# Next prompt — after `@emi/core` unify + Discord linking MVP

Copy this whole file into a fresh agent session (or paste the **Prompt** section).
Do **not** re-do packaging unify or the Discord link MVP — those are already landed.

## Prompt

```text
Continue Emi HealthFit from the current jj tip (parent of empty WC).

## Just landed (do not redo)

Five revisions on `feat/split-core`:

1. docs: record @emi/core subpath packaging and Discord linking status
2. refactor: unify reusable packages into @emi/core with subpath exports
3. feat(api): add Discord account-link tables and authenticated HTTP API
4. feat(chat): add Discord link controls to Settings
5. feat(discord-bot): wire owner-scoped HealthFit commands and registration

Package map now:

- `@emi/core` with subpaths: `/contract` `/server` `/web` `/cloudflare` `/discord`
- `@emi/flavor-healthfit` (separate)
- `@emi/create-chat-app` (separate)
- Deleted: core-contract, core-server, core-web, platform-cloudflare, transport-discord

Discord linking MVP works in code: Settings issues hashed one-time codes;
`/healthfit link|summary|last-workout|recovery|unlink` are wired; unlinked fails
closed; responses ephemeral; rate + size limits; `pnpm discord:register`.

Plans of record:
- `plans/core-flavor-architecture.md`
- `plans/discord-bot.md`

## Your job (pick order, finish one vertical slice first)

### A. Ship Discord linking for real (ops + adopt) — do this before /ask

1. Apply API migrations so `discord_account_links` / `discord_link_codes` exist
   on the shared D1 (`GymData`).
2. Deploy/re-deploy API, then Discord bot.
   - Bot binds `Cloudflare.D1.Database("GymData")` but does **not** own migrations.
   - First Discord stack deploy against existing GymData likely needs Alchemy
     **adopt** so it does not create a second empty D1. Confirm in dry-run/plan.
3. Set secrets: `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN`.
4. Register guild commands first:
   `DISCORD_GUILD_ID=<guild> pnpm discord:register`
   then promote global later without guild id.
5. Manual smoke:
   - Settings → Generate link code
   - Discord `/healthfit link code:<code>`
   - `/healthfit summary|last-workout|recovery` return owner-scoped ephemeral data
   - `/healthfit unlink` then data commands fail closed again
6. If adopt/binding is awkward, document the exact Alchemy command/flags in
   `plans/discord-bot.md` decisions log — do not invent a second database.

Root scripts already exist: `discord:dev`, `discord:deploy`, `discord:register`.

### B. Extract remaining HealthFit surface into `@emi/flavor-healthfit`

Still in apps (deferred from core-flavor phase 6):

- Hevy OAuth/sync + `http/hevy.ts` / integrations
- ingest/data-transfer + `http/data.ts` / `routes/data.ts`
- screens: `/upload`, `/workouts`, `/summary`
- gen-ui / `render_component` catalog still in `apps/chat`

Keep boundary: core never imports flavor. Prefer
`@emi/flavor-healthfit` + `@emi/flavor-healthfit/web` entrypoints.
Add/extend isolation tests. Do not copy source into templates.

### C. Make `generic-worker` feature-complete enough to clone

Today: demo `x-demo-user-id` header; minimal router reimplemented in-app.

Needed:

- Extract shared HTTP/auth composition used by `apps/api` into `@emi/core`
  (or a thin server HTTP entry) so generic-worker reuses real session auth.
- Drop demo header for anything beyond local smoke.
- Keep `create-chat-app` generating only composition roots depending on `@emi/core`.

### D. Deeper `@emi/core/web` shell move

Move `apps/chat` thread/composer shell pieces that are still app-local
(notably deeper `thread.tsx` ownership) into `@emi/core/web` contribution
slots without pulling HealthFit into core.

### E. Deferred on purpose — do not start unless asked

- Discord `/ask` free-form chat (needs deferred ack, dedicated Discord
  conversation, durable generation, budgets, follow-ups — see discord plan).
  *(MVP `/ask` may already be landed — check `plans/discord-bot.md` before
  redoing.)*
- npm publish of `@emi/core` / `@emi/create-chat-app` — **not required** for the
  private HealthFit/Discord monorepo (workspace installs). Only if shipping
  those packages to external npm consumers; see each `PUBLISH.md`.

## Constraints

- Caveman on unless user says stop/normal/no caveman (start replies with OUGABOUGA).
- jj is VCS; split focused revisions; no interactive jj; describe every finished rev.
- Drizzle schema → `pnpm --dir apps/api db:generate` / `db:check`; never hand-edit SQL migrations.
- Prefer `ast-outline` over full file reads; prefix shell with `rtk`.
- Arrow functions; no drive-by refactors; `pnpm fmt` before finishing.
- Before marking session complete: one `pnpm release:check` on final worktree.

## Suggested first slice

Start with **A** (deploy + adopt + register + smoke). If adopt is blocked,
stop and write the exact blocker + command into `plans/discord-bot.md`, then
continue with **B** or **C** as the next code slice.
```

## Context the next agent should trust

### Revision chain (newest parent first)

| Change | Message |
| --- | --- |
| `feat(discord-bot): …` | owner-scoped commands, GymData bind, register script, limits |
| `feat(chat): …` | Settings Discord link controls |
| `feat(api): …` | migrations + `/api/discord` handlers |
| `refactor: unify …` | `@emi/core` subpaths; old packages deleted |
| `docs: record …` | plans + architecture updated |

### Key paths

| Path | Role |
| --- | --- |
| `packages/core/` | unified core (`contract`/`server`/`web`/`cloudflare`/`discord`) |
| `packages/core/src/server/db/discord-*.ts` | link tables + owner-scoped repos |
| `packages/core/src/contract/discord.ts` | wire DTOs / HttpApi group |
| `apps/api/src/core/http/discord.ts` | authenticated handlers |
| `apps/api/migrations/20260721135830_curious_daimon_hellstrom.sql` | link tables |
| `apps/chat/app/discord-link-controls.tsx` | Settings UI |
| `apps/discord-bot/src/commands/` | dispatch, healthfit, services, limits, definition |
| `apps/discord-bot/scripts/register-commands.ts` | guild/global slash registration |

### Import / dependency rules

- Depend on package name `@emi/core` in `package.json`.
- Import subpaths only: `@emi/core/contract`, `@emi/core/server`, `@emi/core/web`, `@emi/core/cloudflare`, `@emi/core/discord`.
- Discord bot may depend on `@emi/flavor-healthfit` for reads; must not depend on `@emi/core/web` or import `apps/api` / `apps/chat` source.
- Generic apps / create-chat-app must not depend on flavor or discord.

### Verify quickly

```bash
rtk pnpm --filter @emi/core test
rtk pnpm --filter @emi/discord-bot test
rtk pnpm --filter @emi/discord-bot typecheck
rtk pnpm --filter @emi/api typecheck
rtk pnpm --filter @emi/api db:check
rtk pnpm --filter @emi/discord-bot dry
```

### Open risks to resolve in slice A

1. **Shared D1 adopt** — discord-bot dry-run still plans `GymData` create; production must adopt the API stack’s database, not fork data.
2. **Secrets / guild id** — registration needs bot token + application id; guild id for fast iteration.
3. **Migration apply** — link tables must exist before `/healthfit link` can succeed against real D1.
