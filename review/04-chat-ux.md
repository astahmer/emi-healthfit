# Review: Temporary chats, OAuth SPA, scroll/rail (`ntlnmqvr` → `xnwvvpsp`)

## Context

Keep temporary chats, createWithMessages, OAuth callback vs SPA `notFoundHandling`, scroll restoration, message rail.

## Comments

### C-030 — Temporary stream then `/messages` 404 marked failed
- **Status:** resolved
- **Introduced:** temporary chat feature (`xxzpvsnm` / `pqwyrlmq`)
- **Resolved in:** `pwzzzskt` (skip history sync) + `norwyryx` e2e
- **Severity:** high (UX)
- **Comment:** Correct product fix. E2E asserts no `/messages` fetch for `temp_*`.

### C-031 — `providerMetadata: undefined` broke Keep
- **Status:** resolved
- **Introduced:** Keep flow (`ntlnmqvr`)
- **Resolved in:** `prtoyuqo` (strip undefined AI SDK part fields)
- **Severity:** high
- **Comment:** Effect Schema encode rejection is easy to miss. Strip-before-encode is the right boundary; worth a unit test on the strip helper if not already present.

### C-032 — Google OAuth stolen by SPA asset handler
- **Status:** resolved
- **Introduced:** deploy/assets config
- **Resolved in:** `upmkprol` (`runWorkerFirst: ["/api/*", "/ingest"]`, `safeNextPath`, AuthBoundary)
- **Severity:** critical
- **Comment:** Classic Workers Assets footgun. Documented well in the revision message; keep `runWorkerFirst` in any new SPA+Worker compositions (create-chat-app / generic-web).

### C-033 — Root `overflow-hidden` clipped notes/memory
- **Status:** resolved
- **Introduced:** layout change
- **Resolved in:** `zrovxoop`
- **Severity:** medium
- **Comment:** Fixed. Watch for reintroduction when restyling shell.

### C-034 — Message rail mobile bottom sheet
- **Status:** resolved (shipped)
- **Introduced:** `pywrpxtt` / `xnwvvpsp`
- **Severity:** n/a
- **Comment:** Unit + e2e coverage noted in revision. No further action.
