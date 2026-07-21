# Review conclusion — `vpvknmox` → `@-` (pre follow-up: `ytvmkrxs`)

Range covered **101 revisions** from SQL-aggregate restore through Discord `/ask`, core/flavor unify, Hevy sync, and chat generation supersede. Follow-up revisions in this session addressed the highest-severity findings (Discord option decode, secret compare, link-code race, error sanitization, tests).

## Verdict

Ship-quality overall: strong ownership tests, Hevy crypto AAD, generation cancel semantics, and a real E2E/mock investment. The worst latent bug found in review was **C-075** (`/ask` options never decoding) — fixed. Remaining opens are mostly ops deferrals, product MVP gaps, or low-severity polish.

## Unsolved / still open

| ID | Severity | Topic | File |
|----|----------|-------|------|
| [C-002](./01-sql-aggregates.md) | low | No assertion that fitness queries stay aggregate-SQL | `01-sql-aggregates.md` |
| [C-014](./02-chat-e2e.md) | low | Playwright retries may mask product races | `02-chat-e2e.md` |
| [C-021](./03-hevy-sync.md) | low | OpenAPI JSON still duplicated under API + flavor | `03-hevy-sync.md` |
| [C-022](./03-hevy-sync.md) | low | `typed-openapi` still `--runtime none` | `03-hevy-sync.md` |
| [C-023](./03-hevy-sync.md) | low | `ensureHevyFresh` still collapses all errors to null (now logged) | `03-hevy-sync.md` |
| [C-042](./05-core-flavor.md) | low | Non-TS asset twins after flavor moves | `05-core-flavor.md` |
| [C-043](./05-core-flavor.md) | low | Confirm prod never sets `ALLOW_DEMO_USER_HEADER=1` | `05-core-flavor.md` |
| [C-044](./05-core-flavor.md) | low | Generic/Thread/npm deferrals (product) | `05-core-flavor.md` |
| [C-045](./05-core-flavor.md) | low | `upload-panel.tsx` ast-outline parse warning | `05-core-flavor.md` |
| [C-054](./06-generation-lifecycle.md) | low | HTTP 409 mapping under true concurrent POSTs | `06-generation-lifecycle.md` |
| [C-064](./07-discord.md) | medium (ops) | Internal ask secret + body `userId` = impersonation if leaked | `07-discord.md` |
| [C-065](./07-discord.md) | low (product) | `/ask` has no fitness tools / user data context | `07-discord.md` |
| [C-067](./07-discord.md) | low | In-memory Discord rate limit (per-isolate) | `07-discord.md` |
| [C-068](./07-discord.md) | low | Discord ask happy-path still needs stubbed `generateText` | `07-discord.md` |

## Resolved in review follow-up (do not re-litigate)

- **C-075** — `/ask` STRING options decoded as empty subcommands → `tzxouymn`
- **C-076** — Settings kept showing revoked Discord code
- **C-062** — link-code consume race → numUpdatedRows guard
- **C-063** — timing-safe ask secret compare
- **C-066** — sanitize Discord ask error content
- **C-025** — `narrowQueryDatabaseClient` at Worker composition root
- **C-021** (docs) — API Hevy README/SCHEDULING pointers
- **C-023** (logging) — warn on `ensureHevyFresh` failure
- **C-043** (tests) — demo header gating unit tests
- **C-054** (store) — cancel-then-create + UNIQUE tests
- **C-068** (partial) — ask auth/body API tests

## Review index

- [`_revision-index.txt`](./_revision-index.txt) — chronological change ids
- [`01-sql-aggregates.md`](./01-sql-aggregates.md)
- [`02-chat-e2e.md`](./02-chat-e2e.md)
- [`03-hevy-sync.md`](./03-hevy-sync.md)
- [`04-chat-ux.md`](./04-chat-ux.md)
- [`05-core-flavor.md`](./05-core-flavor.md)
- [`06-generation-lifecycle.md`](./06-generation-lifecycle.md)
- [`07-discord.md`](./07-discord.md)
- [`08-auth-ownership-docs.md`](./08-auth-ownership-docs.md)

## Suggested next work (priority)

1. **C-064** — Document/rotate `DISCORD_INTERNAL_ASK_SECRET`; consider service-binding-only access.
2. **C-065** — Wire HealthFit tools (or a slim context prompt) into Discord ask when ready.
3. **C-021/C-042** — Single-source OpenAPI regen into flavor only.
4. **C-054** — Concurrent `/api/chat` 409 e2e if flakes appear in prod.
