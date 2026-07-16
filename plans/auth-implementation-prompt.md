# Auth implementation session prompt

Implement the remaining work in `plans/auth.md`. Treat this as one task: finish the per-user ownership
migration and remove the single-account rollout restriction only after isolation is proven.

Read `AGENTS.md` and the entire plan before changing code. Inspect the current implementation and
recent JJ history so completed OAuth/session work is preserved rather than rebuilt.

Required outcome:

- add stable owner ids to every personal-data table and owner-scoped repository operation;
- backfill the existing dataset safely with reviewed counts and an idempotent migration path;
- scope list, read, create, update, delete, search, clone, analytics, resume, import/export, notes,
  memories, and ingestion paths by authenticated user id;
- add two-user isolation tests, guessed-id tests, anonymous route tests, and migration tests;
- remove the “exactly one allowed email” guard only when the migration and tests prove multi-user
  isolation;
- update `plans/auth.md` and deployment documentation with the final rollout procedure.

Do not weaken auth, use email as row ownership, or make unrelated product changes. Preserve existing
worktree changes. Use multiple coherent JJ revisions for migration/schema, repositories/routes,
frontend or deployment changes, and tests/docs. Run focused tests while iterating, then the repository
checks required by `AGENTS.md`. Finish with revision ids, verification results, migration risks, and any
remaining deployment-only step.
