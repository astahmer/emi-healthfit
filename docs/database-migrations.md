# Database migrations and drift

Production schema changes must flow through the code-driven schema. The invariant:

`apps/api/src/db/schema.ts` → `db:generate` (Drizzle journal) → `db:migrate:prod` (apply) → release verifies.

## Commands

- `pnpm --filter @emi/api db:verify:prod` — read-only. Replays the committed
  `apps/api/prod-schema-baseline.sql` plus every newer journal migration into a temporary SQLite
  database, then compares tables, columns, indexes, and triggers against production D1. Also
  reports journal entries that are missing from production.
- `pnpm --filter @emi/api db:migrate:prod` — applies pending journal migrations in order and
  journals them, then re-verifies. This is the only sanctioned apply path.
- `pnpm --filter @emi/api db:migrate:prod --record <migration.sql>` — journals a pending migration
  without executing it. Use only when production already has the DDL but the journal row is
  missing (for example a migration that was applied by hand). Fails loudly afterwards if the
  schema does not match.
- `pnpm --filter @emi/api db:baseline:prod` — captures production DDL as the new baseline. Refuses
  while production has pending migrations or drift; `--force` exists only for deliberate
  reconciliation.
- `pnpm release:deploy` — refuses to deploy until `db:verify:prod` passes, then deploys the tagged
  revision through the production Alchemy stage.

## When verification fails

Read the error direction:

- **"Pending production D1 migrations must be applied first"** — run `db:migrate:prod`.
- **"Production schema already matches these pending migrations"** — the DDL is applied but the
  journal is missing it; run `db:migrate:prod --record <name>` for each listed migration.
- **`missing table/column/index`** in production — the migration that creates it was never applied
  or was reverted. Run `db:migrate:prod`; if it is already journaled, re-run that migration file
  directly (the apply script refuses journaled migrations by design).
- **`extra table/column/index/trigger`** in production — something was added outside the code
  schema. If it should stay, add it to `schema.ts`, run `db:generate`, and apply the new
  migration. If it should be removed, that is a destructive change: stop and discuss before
  dropping anything from production.
- **`column mismatch`** — either production was hand-altered (restore it by re-applying the
  migration that owns the column) or `schema.ts` drifted from reality (fix `schema.ts`, generate,
  apply). SQLite cannot alter column types in place; Drizzle emits a table rebuild migration when
  needed.

Never "fix" drift by re-capturing the baseline — that hides the problem. The baseline only
advances through `db:baseline:prod --force` after an explicit decision.
