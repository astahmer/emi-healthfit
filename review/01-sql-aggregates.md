# Review: SQL aggregates restore (`vpvknmox`)

## Context

`vpvknmox` restored SQL aggregates in fitness queries after a Kysely rewrite had pulled full row sets into JS. Later flavor extraction (`mxqqtnrs` → `kmkqruml`) moved the implementation into `@emi/flavor-healthfit`; `apps/api` keeps thin re-exports.

## Comments

### C-001 — Aggregates correctly live in flavor package
- **Status:** resolved
- **Introduced:** `vpvknmox` (restore SQL fns usage)
- **Resolved in:** `kmkqruml` / flavor move — implementation is in `packages/flavor-healthfit/src/db/fitness.ts` with `eb.fn` / `sql` aggregates; API barrels re-export.
- **Severity:** n/a (positive)
- **Files:** `packages/flavor-healthfit/src/db/fitness.ts`, `apps/api/src/healthfit/db/fitness.ts`
- **Comment:** Intent preserved. `getWorkouts` still hydrates set rows in JS by design (needs exercise details). Covered by `apps/api/test/fitness.integration.test.ts`.

### C-002 — No regression test asserting SQL shape
- **Status:** open
- **Introduced:** `vpvknmox`
- **Severity:** low
- **Files:** `packages/flavor-healthfit/src/db/fitness.ts`, `apps/api/test/fitness.integration.test.ts`
- **Comment:** Integration tests assert result values, not that queries avoid full-table materialization. A future “optimize with fetch-all” rewrite could slip through. Prefer a compile-time or query-spy assertion if we ever reintroduce a query builder abstraction; not blocking.
