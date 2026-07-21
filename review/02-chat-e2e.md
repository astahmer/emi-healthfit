# Review: Chat E2E infrastructure (`pxmtlrvo` → `onplpqzz`)

## Context

Large wave of Playwright + Hono mock + xstate path suites + playwright-bdd, then Hevy Settings e2e and generation UX coverage. Several flake-hardening revisions followed.

## Comments

### C-010 — Parallel UI journey machine dropped (good)
- **Status:** resolved
- **Introduced:** `mwtxuquk` (UI journey machine)
- **Resolved in:** `wksvxqno` (drop unused twin)
- **Severity:** medium (would have been drift risk)
- **Comment:** Correct call — a second machine that never drove Playwright would diverge from production. Path suites stay on real machines; E2E stays BDD/TS against the app.

### C-011 — Sidebar session-actions race (pointer-events)
- **Status:** resolved
- **Introduced:** surfaced during e2e work (~`qkxtkzzt` / `onplpqzz`)
- **Resolved in:** `onplpqzz` via shared `e2e/open-session-actions.ts` (Escape → wait menu gone → reopen)
- **Severity:** high (test reliability)
- **Comment:** Real Radix interaction hazard. Helper is the right fix; keep using it for any new sidebar action specs.

### C-012 — `navigator.share` hung Playwright
- **Status:** resolved
- **Introduced:** share coverage (`ysvvnvqv` era)
- **Resolved in:** `xysorlur` (disable share in E2E) + later controlled share probe
- **Severity:** medium
- **Comment:** Environment-specific; documented in revision. Fine.

### C-013 — createChatMock DSL migration incomplete risk
- **Status:** resolved
- **Introduced:** `xuywtoqz`
- **Resolved in:** `vyqtytrl` + scenario migrations
- **Severity:** low
- **Comment:** Migrating off `page.route` if-chains reduced flake surface. New specs should extend the Hono mock DSL, not add ad-hoc routes.

### C-014 — Retries masking product bugs
- **Status:** open
- **Introduced:** `rlrwqxkl` (Playwright retries enabled)
- **Severity:** low
- **Files:** chat Playwright config / e2e specs
- **Comment:** Retries are appropriate for CF/worker timing noise, but watch for product races being “fixed” by retry alone. Prefer deterministic waits (as in open-session-actions) over bumping retries further.
