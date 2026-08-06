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
