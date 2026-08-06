# Handoff: Auto-compact at token budget with visible summary

## Goal

Make the per-conversation token budget an auto-compact trigger, never a blocker. When a send
would push stored usage over the effective budget, compact old messages in place into a visible
"compacted summary" block inside the same conversation. Budget stays editable per conversation
and configurable as a default in Settings; `0` disables it (already shipped).

## Current state (verified 2026-08-06)

- Budget UI: `apps/chat/app/usage-context.tsx` — `ConversationUsage` popover; per-conversation
  override key `emi-healthfit:token-budget:<conversationId>`; settings default `tokenBudget` in
  `apps/chat/app/settings-store.ts` (`DEFAULT_TOKEN_BUDGET = 100_000`, persist migration v2 via
  `withDecodingDefaultType`). Over-budget already shows the real percentage and an "over budget"
  label — display only, nothing acts on it.
- Manual compact creates a NEW conversation: `POST /api/conversations/:id/compact` in
  `apps/api/src/chat/http/conversations.ts:218-280`; client flow in
  `packages/core/src/web/chat-runtime/conversation-client.ts:292` (`compactConversation`) and
  `conversation-store-actor.ts:319` (`conversation-compact-requested`); UI button in
  `packages/core/src/components/styled/internal/chat-sidebar.tsx:189`. It summarizes via
  `Chat.generation.generateConversationSummaryEffect`
  (`packages/core/src/adapters/ai-sdk/openai-chat.ts:338`), then creates a "(compacted)"
  conversation whose first message is a system prompt containing the summary.
- `summary` role already exists end-to-end: `packages/core/src/server/db/schema.ts:45`
  (`messages.role` enum includes `"summary"`); per-message usage is persisted
  (`prompt_tokens`/`completion_tokens`/`total_tokens`). API history excludes summary rows from
  model context (`apps/api/src/chat/history.ts:67`); `packages/core/src/cloudflare/chat-route-conversation.ts:158`
  drops them from the provider payload; `apps/chat/app/conversations.ts:90` maps `summary` to
  `assistant` for display and `fetchConversationMessages` strips them
  (`apps/chat/app/conversations.ts`, around line 100); `apps/chat/app/chat/page.tsx:72`
  (`compactedSummary`) reads the last summary message for the conversation title.
- Send path: `apps/api/src/chat/http/conversations.ts:278+` builds the request to
  `apps/api/src/chat/generation-lifecycle.ts` to `prepareChatHistory`
  (`apps/api/src/chat/history.ts`). Request schema:
  `apps/api/src/chat/request-codec.ts` (`ChatStreamRequestSchema`).
- E2E mock: `apps/chat/e2e/mock/app.ts` (compact handler around line 502, `state.compact`),
  `apps/chat/e2e/features/usage.feature` (budget default + over-budget scenarios),
  `apps/chat/e2e/features/compact.feature` (manual compact scenarios).

## Design (recommended; deviate only with justification)

1. **Trigger** — server-side at send time, in `prepareChatHistory` (`apps/api/src/chat/history.ts`)
   or just before it in `generation-lifecycle.ts`. Compute stored usage by summing
   `total_tokens` over rows that are `role != "summary"` and newer than any existing compaction
   marker. Compact when that sum plus the incoming message would exceed the effective budget.
2. **Budget transport** — add `tokenBudget: Schema.optional(Schema.Number)` to
   `ChatStreamRequestSchema` (`apps/api/src/chat/request-codec.ts`) and the client send-message
   request. `0`/absent = no budget. Keep the budget client-owned (settings store + per-conversation
   localStorage) — no server persistence or migration for the budget itself.
3. **In-place compaction** — extend the existing `compact` endpoint with an `inPlace` mode (or add
   a dedicated `POST /api/conversations/:id/auto-compact`):
   - Generate the summary from pre-compaction messages with
     `generateConversationSummaryEffect`.
   - Insert one `role: "summary"` message at the compaction point.
   - Add a nullable compaction marker on conversations (e.g.
     `compacted_before_message_id` or a `created_at` cut-off) through Drizzle only:
     edit `packages/core/src/server/db/schema.ts`, then
     `pnpm --filter @emi/api db:generate` and `db:check`. Never hand-edit SQL.
   - `history.ts`: replace pre-marker rows with the latest summary in the model context (map the
     summary to a system message for the provider payload — the summary must reach the model, not
     just the UI), and keep filtering older rows.
   - Messages endpoint keeps returning summary rows (it already returns all rows); the client
     must stop stripping them: `apps/chat/app/conversations.ts` `fetchConversationMessages` should
     keep `role: "summary"` rows and `toMessage` should preserve the role instead of mapping to
     `assistant`.
   - UI: render `role: "summary"` as a collapsible block (`<details>` open by default) with a
     divider before it, styled like a tool-result card, in
     `packages/core/src/web/thread/thread-message.tsx` (or the message list used by `apps/chat`).
     Muted label such as "Context compacted" plus the summary text.
4. **Threads** — branches anchored before the marker collapse to summary + branch rows (acceptable
   v1; document it). Do NOT delete old rows: threads reference message ids and deletion breaks
   anchors. Keep D1 rows, filter/hide only.
5. **Never block, never silent** — an over-budget send always compacts first and shows the block.
   Repeated compactions stack (context = latest summary + newer messages).

## Acceptance criteria

- Sending at or under budget: unchanged behavior.
- Sending over budget: request proceeds; older messages are replaced in the UI by one
  open-by-default, collapsible summary block with a divider; summary text is visible; model
  context contains the summary plus post-compaction messages only (assert via API test on the
  provider payload).
- `tokenBudget` `0` or absent: never compacts.
- No data loss: old rows remain in D1 (hidden/filtered only); threads still load.
- Manual compact keeps its current "(compacted)" new-conversation behavior.
- Usage popover still shows tokens, budget, and over-budget state.

## Tests required (repo rules)

- API: real SQLite integration test (pattern: `apps/api/test/generation-budget.test.ts`) — an
  over-budget send inserts a summary row and the history payload contains summary + new messages
  only; under-budget is unchanged; budget `0` is a no-op. Add a contract-encoding test for the new
  payload field (wire scalar change rule).
- Unit: summary message renders as an open collapsible block; `fetchConversationMessages` keeps
  summary rows; `toMessage` preserves the role.
- Playwright e2e (mandatory for front-facing changes), mock mode: scenario in `usage.feature` or
  `compact.feature` — small budget, send, expect summary block visible, old messages hidden,
  block collapsible. Real Worker mode
  (`pnpm --dir apps/chat run test:e2e:worker`) at least for the persistence path if feasible.
- Final gate: one `pnpm release:check` run on the finished worktree; do not mark complete on red.

## Workflow notes

- Split work into focused jj revisions (contract + API, schema + migration, UI rendering, tests /
  e2e), each with a concise message. Keep unrelated heads/wips untouched.
- Cloudflare Free D1 caps at 50 subrequests per request — the usage sum is cheap; compaction adds
  about 2 ops. Respect reserved terminal persistence in `apps/api/src/chat/generation-budget.ts`.
- Keep XState/Effect behind facades and React view-only (see `xstate-actor-design` and
  `runtime-boundary-audit` skills in `.agents/skills/`).

## Out of scope

Remote-synced budgets, auto-compact triggered while just viewing, cost display changes, physically
deleting old rows, per-model context limits.

## Shipped (2026-08-06)

Implemented end-to-end. Deviations from the recommended design, with justification:

- **No compaction marker column / no Drizzle migration.** The latest `summary` row is the marker:
  it is inserted at the compaction point, so `created_at > latest summary` already identifies
  post-compaction rows. A nullable `compacted_before_message_id` column would duplicate that
  state and drift. `history.ts` filters pre-marker rows, maps the latest summary to a system
  message, and (for threads) collapses to `summary + branch rows`.
- **Repeated compactions regenerate the summary over all non-summary rows**, superseding older
  summaries, so rows between the old and new marker are never lost from context.
- **Client reload via response header.** `prepareChatHistory` returns `compacted`; the stream
  response carries `x-conversation-compacted`; the core transport emits a
  `conversation-compacted` session event and the lifecycle actor reloads the conversation from
  the store. This makes the summary block appear without a manual refresh.
- **Client-side collapse.** The messages endpoint still returns every row; the client collapses
  pre-marker rows through `Chat.messages.collapseCompactedMessages` in all three decode paths
  (`conversations.ts`, `healthfit-chat-adapter`, core `conversation-client`). Old rows stay in
  D1.
- **The "Compacted context" top aside was removed** in favor of the in-flow collapsible block
  (both rendered the same text for compacted conversations). `compactedSummary` plumbing in
  `page.tsx`/`chat-page-content.tsx`/`thread.tsx`/`thread-message-list.tsx` was dropped.
- **Trigger scope:** compaction runs for new sends only (not `replaceMessageId` revisions), and
  never blocks the request — summary-generation failure logs and proceeds uncompacted.
- **Threads preserved (2026-08-06 follow-up):** the lifecycle reloads the focused thread
  (`thread-load-requested`) instead of the conversation; `threads.read` now appends the latest
  summary; the client collapse keeps branch rows (`parentId` set) and hides the pre-marker
  anchor, so "summary + branch rows" holds in both the provider payload and the UI.
- **409 race fixed:** generation admission (`cancelRunningGenerations` + `createGeneration`)
  now runs before `prepareChatHistory`, so a request that loses the race returns 409 before it
  compacts or persists anything; validation failures after admission mark the generation failed.
- **`onStreamCompleted` preserved:** the lifecycle captures the completed assistant message at
  `stream-completed`, so memory extraction still fires even when the compaction reload replaces
  the session before `stream-finished`.
- **Timestamp-tie safety:** compaction markers are positional (conversation array order = D1
  insertion order), not `created_at` comparisons, in both `history.ts` and the client collapse;
  rows saved in the same millisecond as the marker are classified correctly.
- **Known tradeoffs (v1):** a compaction that lands while a generation conflict is in flight can
  still insert a summary row only if it won the race (the winner's request proceeds); the
  reloaded thread view drops the pre-marker anchor row from the display.

Acceptance coverage: API SQLite integration tests in `apps/api/test/chat-history.integration.test.ts`
(over-budget summary + provider payload, under-budget unchanged, budget `0` no-op, stacked
compactions, thread collapse before/after the marker, summary-failure fallback, exact-budget
boundary, estimate fallback), a generation-admission race test
(`apps/api/test/generation-admission.integration.test.ts`) proving a 409 loser never compacts or
persists, codec contract tests, transport/lifecycle actor tests for the compaction header, thread
reload, and captured completion, unit tests for the collapsible block and the collapse helper,
mock-mode Playwright scenarios in `usage.feature` (auto-compact, exact-budget no-op, stacked
summaries, focused-branch preservation), and a real-Worker scenario proving the summary is
compacted and persisted through D1.
