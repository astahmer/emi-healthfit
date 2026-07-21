# Review: Hevy sync (`uruvzkyq` → `kxkzlppu`, later flavor move)

## Context

Typed OpenAPI client, encrypted credential store, Free-tier sync (lease + watermark + stale-on-demand), Settings UI, then move into `@emi/flavor-healthfit` (`koutyvts`). Strong test suite in `apps/api/test/hevy-*.test.ts`.

## Comments

### C-020 — Credential encryption binds userId as AAD
- **Status:** resolved (by design; positive)
- **Introduced:** `txwomsqt`
- **Severity:** n/a
- **Files:** `packages/flavor-healthfit/src/integrations/hevy/credential-crypto.ts`
- **Comment:** AES-GCM with `additionalData: userId` prevents ciphertext transplant across users. Good.

### C-021 — Duplicate Hevy docs under `apps/api` and flavor
- **Status:** open
- **Introduced:** `koutyvts` (flavor extract copied README/SCHEDULING/openapi)
- **Severity:** low
- **Files:** `apps/api/src/healthfit/integrations/hevy/README.md`, `packages/flavor-healthfit/src/integrations/hevy/README.md` (+ SCHEDULING.md, openapi JSON)
- **Comment:** TS modules are thin re-exports; markdown + OpenAPI snapshots are full duplicates. Drift risk. Prefer a single canonical copy in flavor and short pointers (or generated sync) from the API tree.

### C-022 — `typed-openapi` runtime still `none`
- **Status:** open (deferred / documented TODO)
- **Introduced:** `uruvzkyq`
- **Severity:** low
- **Files:** Hevy README TODO, generated client
- **Comment:** Effect wrapper around the types-only client is fine for MVP. Switching to `--runtime effect` when published would remove hand-rolled error mapping — track, don't block.

### C-023 — `ensureHevyFresh` swallows all errors
- **Status:** open
- **Introduced:** `vykvkmqt` / sync paths
- **Severity:** medium
- **Files:** `packages/flavor-healthfit/src/integrations/hevy/hevy-sync.ts` (`ensureHevyFresh`)
- **Comment:** `.pipe(Effect.catch(() => Effect.succeed(null)))` intentionally keeps last D1 data when Hevy is down (covered by lifecycle test). Side effect: auth/config failures also become silent no-ops on read paths. Consider distinguishing `HevyNotConnectedError` / busy vs unexpected errors with at least a warning log metric so operators notice broken encryption keys.

### C-024 — Live smoke gated on `HEVY_API_KEY`
- **Status:** resolved (acceptable)
- **Introduced:** `rqwksrxu`
- **Severity:** n/a
- **Comment:** Optional live integration is the right default for CI. Keep it opt-in.

### C-025 — Composition-root `as unknown` for Hevy/tools DB
- **Status:** open
- **Introduced:** `yqlpwzwx` / flavor wiring in `api.worker.ts`
- **Severity:** low
- **Files:** `apps/api/src/api.worker.ts`
- **Comment:** Documented Kysely invariance issue. Narrow helper already exists (`narrowQueryDatabaseClient`). Prefer using that helper at the chat `beforeChat` / `executeTool` sites for consistency instead of inline `as unknown as Parameters<...>`.
