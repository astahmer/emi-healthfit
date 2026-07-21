# Review: Auth, ownership, publish docs

## Comments

### C-070 — Ownership migration + isolation tests
- **Status:** resolved (positive)
- **Introduced:** `slxokuqr` (+ earlier ownership work)
- **Files:** `ownership-isolation.test.ts`, `ownership-migration.test.ts`
- **Comment:** Strong. New tables should get ownership assertions when user-scoped.

### C-071 — Publish readiness keeps packages `private`
- **Status:** resolved
- **Introduced:** `nkpovzpy` / clarified `ytvmkrxs`
- **Severity:** n/a
- **Comment:** `PUBLISH.md` + “optional for private monorepo” avoids accidental public npm pushes. Good.

### C-072 — Null sleep dates stripped from analytics DTO
- **Status:** resolved
- **Introduced:** `pwnrmmwy`
- **Severity:** n/a
- **Comment:** Contract hygiene. Keep encoding tests when DTO fields change (AGENTS.md).

### C-073 — Prod domain / deploy one-offs
- **Status:** resolved
- **Introduced:** `pqoolnpl`, `mxzowkrm`, …
- **Severity:** n/a
- **Comment:** Ops commits in the range; no lingering review action beyond ensuring env examples match Alchemy.

### C-074 — Plan doc cleanup
- **Status:** resolved
- **Introduced:** `wuxuvplx`
- **Comment:** Dropping shipped plans reduces agent confusion. Keep architecture + active discord/core-flavor plans.
