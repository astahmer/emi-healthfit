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
- **Status:** resolved (docs); open for OpenAPI JSON twin
- **Introduced:** `koutyvts` (flavor extract copied README/SCHEDULING/openapi)
- **Resolved in:** review follow-up — API `README.md` / `SCHEDULING.md` are pointers to flavor
- **Severity:** low
- **Files:** `apps/api/src/healthfit/integrations/hevy/README.md`, `packages/flavor-healthfit/src/integrations/hevy/README.md` (+ openapi JSON)
- **Comment:** Markdown drift fixed via pointers. Generated `hevy.openapi.json` (+ client) may still exist under both trees — keep regen scripts single-sourced when next touched.

### C-022 — `typed-openapi` runtime still `none`
- **Status:** open (deferred / documented TODO)
- **Introduced:** `uruvzkyq`
- **Severity:** low
- **Files:** Hevy README TODO, generated client
- **Comment:** Effect wrapper around the types-only client is fine for MVP. Switching to `--runtime effect` when published would remove hand-rolled error mapping — track, don't block.

### C-023 — `ensureHevyFresh` swallows all errors
- **Status:** resolved (logging); open for typed triage
- **Introduced:** `vykvkmqt` / sync paths
- **Resolved in:** review follow-up — `Effect.logWarning("hevy.ensureFresh.failed")` before returning null
- **Severity:** medium → low
- **Files:** `packages/flavor-healthfit/src/integrations/hevy/hevy-sync.ts` (`ensureHevyFresh`)
- **Comment:** Failures are no longer silent. Optional next step: skip warn for expected busy/not-connected vs config/auth errors.

### C-024 — Live smoke gated on `HEVY_API_KEY`
- **Status:** resolved (acceptable)
- **Introduced:** `rqwksrxu`
- **Severity:** n/a
- **Comment:** Optional live integration is the right default for CI. Keep it opt-in.

### C-025 — Composition-root `as unknown` for Hevy/tools DB
- **Status:** resolved
- **Introduced:** `yqlpwzwx` / flavor wiring in `api.worker.ts`
- **Resolved in:** review follow-up — `narrowQueryDatabaseClient<HealthfitDatabaseSchema|HealthfitToolsDatabaseSchema>`
- **Severity:** low
- **Files:** `apps/api/src/api.worker.ts`, `packages/flavor-healthfit/src/tools/api.ts` (`HealthfitToolsDatabaseSchema` export)
- **Comment:** Composition root now matches other HealthFit HTTP handlers.
