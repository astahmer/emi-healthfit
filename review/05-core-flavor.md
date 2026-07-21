# Review: Core / flavor architecture (`slxokuqr` → `sunlusot`, later slices)

## Context

Ownership gates → API split → core-contract/server/web/cloudflare/discord packages → unify into `@emi/core` subpaths → flavor screens + auth extract + contribution slots.

## Comments

### C-040 — Fail-closed child inserts under RequestContext
- **Status:** resolved (positive)
- **Introduced:** `slxokuqr`
- **Severity:** n/a
- **Files:** conversation/generation repositories, `ownership-isolation.test.ts`
- **Comment:** Cross-user insert isolation tests are the right backstop. Keep adding cases when new parent/child tables appear (e.g. Discord link tables are user-scoped differently — OK).

### C-041 — Package unify into `@emi/core` subpaths
- **Status:** resolved
- **Introduced:** multi-package extract (`qppvmuoq`…`yqlpwzwx`)
- **Resolved in:** `sunlusot` (+ docs `rstkwlsr`)
- **Severity:** n/a
- **Comment:** Subpath exports (`/contract`, `/server`, `/web`, `/cloudflare`, `/discord`) match the intended boundaries. Entry isolation tests exist — good.

### C-042 — Thin re-export barrels vs duplicated assets
- **Status:** open
- **Introduced:** flavor moves (`mxqqtnrs`, `koutyvts`, `wuxryknl`, …)
- **Severity:** low
- **Comment:** Same theme as C-021: TS re-exports are clean; non-TS assets (docs, openapi JSON under `apps/api`) still duplicate. Not a runtime bug.

### C-043 — Demo `x-demo-user-id` header still available
- **Status:** resolved (tests); open (prod env assertion)
- **Introduced:** pre-range / retained in `ptvqksrw` extract
- **Resolved in:** review follow-up — `readDemoPrincipalFromHeader` unit tests (flag off ignores header)
- **Severity:** medium (ops) → low
- **Files:** `packages/core/src/cloudflare/auth/request-auth.ts`, `packages/core/test/cloudflare/demo-principal.test.ts`
- **Comment:** Behavior covered. Still confirm Alchemy prod never sets `ALLOW_DEMO_USER_HEADER=1`.

### C-044 — Generic worker vs HealthFit composition
- **Status:** open (deferred product work)
- **Introduced:** `nlqnrlql` / create-chat-app
- **Severity:** low
- **Comment:** Plans still list Thread/npm/ops deferrals. Architecture direction is sound; remaining slices are product, not defects.

### C-045 — `upload-panel.tsx` parse warning in outline
- **Status:** open
- **Introduced:** `sszwslqn`
- **Severity:** low
- **Files:** `packages/flavor-healthfit/src/web/upload-panel.tsx`
- **Comment:** `ast-outline` reports `[broken]` / parse error. Likely TSX edge the outline parser dislikes — verify file typechecks and consider simplifying syntax if the outline tool is used in CI.
