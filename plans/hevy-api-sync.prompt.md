# Hevy API sync implementation handoff

Implement [`hevy-api-sync.md`](./hevy-api-sync.md) as one security-sensitive, D1-first Hevy
integration. Read the full plan, `AGENTS.md`, current auth/ownership architecture, existing CSV
ingestion, Drizzle schema, typed HTTP API, Settings UI, chat workout context, and privacy/export
flows before editing. The working copy already contains unrelated user changes; inspect `jj status`,
`jj diff`, and nearby log first, then preserve those changes exactly.

Ship the plan's MVP, not the deferred features:

- Hevy remains canonical for workouts; D1 is the only runtime read model for Emi UI, analytics,
  chat tools/context, and any future MCP.
- Add secure per-user API-key connection storage using a versioned AES-GCM envelope and a redacted
  Worker secret. Never place the credential in client storage, URLs, logs, diagnostics, R2, exports,
  model context, or API responses.
- Use a small Effect + Effect Schema provider adapter. At implementation time verify current official
  [Hevy API docs](https://api.hevyapp.com/docs/) and capture sanitized fixtures. Decode every
  provider response; do not cast `JSON.parse` output. Support initial pagination, events-since
  pagination, complete-detail fetches, update, deletion, bounded concurrency, errors, and timeouts.
- Implement idempotent initial and incremental sync with an inclusive cursor overlap, transaction/
  cursor failure safety, per-user lease/coalescing, and stale-on-demand `ensureHevyFresh` with a
  15-minute central policy. Serve last successful D1 data if a refresh fails. Add status, connect,
  force-sync, disconnect, and remove-data typed endpoints and Settings UI.
- Fix the existing Hevy schema's provider identity and repeated-exercise collision before API writes.
  Preserve legacy CSV ids, only reconcile an exact unambiguous title/start-time match, and report
  ambiguous legacy rows rather than deleting or guessing.
- Keep CSV import working. Make disconnect remove the key/state but retain history; make Remove
  cached Hevy data delete key, sync state, normalized Hevy rows, and raw CSV uploads after a clear
  confirmation.

Do **not** install or proxy `chrisdoc/hevy-mcp`, build a public MCP endpoint, add Hevy writes,
sync routines/templates/measurements, or add scheduled sync. Assess cron/MCP only after the MVP has
real latency and failure evidence.

Use Drizzle schema files as the only structural source of truth; generate migrations using
`pnpm --filter @emi/api db:generate` and validate with `pnpm --filter @emi/api db:check`. Do not
hand-edit migration SQL or metadata. Follow project Effect conventions: `Effect.fn`, spans,
qualified `Schema.TaggedError` errors, standard schemas, explicit database-to-domain mapping, and
owner scoping. Add decoder/mapper tests, live SQLite integration assertions for schema/persistence,
pagination/zero-change/update/delete/partial-failure/concurrency tests, contract-encoding tests,
and focused Settings UI tests. Do not mock the database.

Split work into coherent JJ revisions: schema/credential security; provider + sync service; typed
API + freshness integration; Settings/privacy/docs/tests. Run focused checks while working. Update
the plan's decisions/acceptance items if facts change. Immediately before handoff run
`pnpm release:check` once on the final worktree. Report revision ids, changed scopes, required
Worker secrets, deployment setup, focused test results, and the final release-check result.
