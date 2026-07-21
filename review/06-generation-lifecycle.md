# Review: Chat generation cancel / supersede (`zwyoxkqn` → `vtqmuqvv`)

## Context

One-active unique index on `chat_generations` made Stop/Send-again deadlock without server-side cancel. Client got cancel-and-send, draft-while-streaming, and 409 parsing.

## Comments

### C-050 — Cancel before create + `finishGeneration` only on active rows
- **Status:** resolved (positive)
- **Introduced:** `zwyoxkqn` / `finishGeneration` guard
- **Severity:** n/a
- **Files:** `apps/api/src/core/chat/generation-store.ts`, `chat-generation-lifecycle.ts`
- **Comment:** `finishGeneration` filters `status in ('pending','streaming')` so late finishes after cancel are no-ops — covered by `generation-store.integration.test.ts`.

### C-051 — `client.stopped` cancels running generation
- **Status:** resolved
- **Introduced:** `zwyoxkqn`
- **Severity:** n/a
- **Comment:** Diagnostic event path calls `finishGeneration` with cancelled. Good coupling of client stop to server unlock.

### C-052 — Composer Send visible with draft during stream
- **Status:** resolved
- **Introduced:** `ssznqltk` / `vtqmuqvv`
- **Severity:** n/a
- **Comment:** Matches supersede semantics. E2E covered in `rlrwqxkl`.

### C-053 — Temporary chats skip cancel/create generation path
- **Status:** resolved (by design)
- **Introduced:** temporary + lifecycle split
- **Severity:** n/a
- **Comment:** `if (!isTemporary) { cancelRunning…; createGeneration… }` is correct — no unique-index pressure for `temp_*`.

### C-054 — Race: cancelRunning then create still unique-index collide?
- **Status:** open
- **Introduced:** `zwyoxkqn`
- **Severity:** low
- **Files:** `generation-store.ts`, `chat-generation-lifecycle.ts`
- **Comment:** Two concurrent POSTs for the same conversation could both cancel then both insert if not transactional. D1/SQLite uniqueness would fail one request — client should surface conflict. Confirm HTTP mapping for unique violations is user-friendly (409), and add a focused concurrency test if missing.
