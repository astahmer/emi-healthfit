Continue hardening Emi HealthFit chat so production failures are prevented, recovered automatically, or made invisible to users.

Current state:

- Workspace: /Users/astahmer/dev/emi-healthfit
- Current JJ working-copy revision: `fix(chat): batch stream persistence and repair retries` (fc1fbd71).
- It is deployed to production as Worker version `e058d41f-7554-4bf9-b6dc-99dee0808c80`.
- Do not discard, reset, or duplicate existing working-copy changes. Start with:
  - `rtk jj status`
  - `rtk jj log -r '::@' --limit 8`
  - `rtk jj diff`
- Existing revision passed `pnpm release:check`.
- Use Jujutsu. Split completed work into focused, described JJ revisions. Preserve unrelated user changes.
- Follow AGENTS.md: `rtk` prefix on every shell command, use Effect patterns, no manual SQL migrations, no unsafe casts, add focused real tests, and run `pnpm release:check` before handoff.

Incident investigated:
Conversation:
https://emi-healthfit.astahmer.dev/chat/e671debe-1d50-40ca-9f2a-c40a46ff3944

Production failures included:

1. `Too many API requests by single Worker invocation`
2. `D1_ERROR: Network connection lost.`
3. Stored invalid AI SDK `dynamic-tool` error parts, causing later history validation failures.
4. Refresh/retry duplicated orphan user messages.
5. Invalid `render_component` MetricCard props.
6. Timed-out/cancelled generations, reconnect gaps, and excessive repeated context tokens.

Already implemented/deployed:

- Stream-generation chunks are persisted in batches of 20 instead of each chunk doing a D1 read + batch.
- Transient D1 “Network connection lost” failures retry twice.
- Legacy malformed tool-error parts are normalized while loading history.
- Duplicate resubmission of the trailing orphan user message is treated as retry, not a new message.
- `render_component` tool instructions now give exact valid props.
- Relevant files:
  - apps/api/src/core/routes/chat-stream-persistence.ts
  - apps/api/src/core/chat/generation-store.ts
  - packages/core/src/cloudflare/db/client.ts
  - apps/api/src/core/chat/ui-messages.ts
  - apps/api/src/core/chat/orphan-turn.ts
  - apps/api/src/core/routes/chat-history.ts

Important Cloudflare constraint:

- Workers Free allows only 50 D1 queries/subrequests per invocation.
- `limits.subrequests` cannot raise this on Free; do not add a redundant `limits` config.
- Keep normal chat comfortably below the quota, including tool calls, event logging, D1 reads/writes, retries, and streaming persistence.

Goal:
Make chat feel flawless. A transient backend issue should normally recover automatically, preserve the user’s message, resume or replay safely, and avoid duplicate messages/responses. The user should only see a clear recovery state when automatic recovery is genuinely exhausted.

Work to investigate and implement where justified:

1. Add an explicit per-generation subrequest/D1-operation budget with structured telemetry. Gracefully degrade optional diagnostics/persistence before the Worker hits Cloudflare’s hard limit.
2. Audit all D1 calls in chat lifecycle, tool execution, history loading, event recording, reconnect/resume, title generation, and follow-up queue flows. Batch or remove redundant work.
3. Make retries idempotent end-to-end:
   - stable client request/message IDs;
   - server-side request idempotency;
   - no duplicated user turns or assistant persistence;
   - safe retry after browser refresh, disconnect, and multiple tabs.
4. Improve automatic stream recovery:
   - reconnect/resume existing persisted generation;
   - retry only transient failures with bounded backoff;
   - never replay a tool operation unsafely;
   - preserve partial output where valid.
5. Define persistence degradation:
   - user stream should not fail merely because non-essential telemetry or chunk persistence fails;
   - terminal state and replay must stay consistent;
   - surface an actionable recovery path if durability cannot be guaranteed.
6. Harden tool execution:
   - tighter per-tool and total tool-call budget;
   - prevent repeated equivalent failures;
   - validate/render component inputs before expensive execution;
   - make tool error persistence AI-SDK-valid.
7. Add observability that makes future incidents easy to diagnose:
   - request/generation IDs;
   - D1 operation and retry counts;
   - batch sizes;
   - reconnect/resume outcomes;
   - budget-exhaustion events;
   - structured Cloudflare logs suitable for alerts.
     Do not send external notifications without explicit user approval.
8. Prevent context/token runaway from duplicate retries and oversized historical tool output. Preserve useful context, but enforce a measured, tested bound.

Testing expectations:

- Add focused unit tests for budgets, idempotency, malformed/legacy history, retry classification, and terminal state transitions.
- Add real SQLite integration tests for persistence and ownership semantics.
- Add browser/e2e tests for refresh/disconnect/reconnect/retry where practical.
- Avoid mocks when an actual implementation test is possible.
- Run focused tests while iterating; run `pnpm release:check` once at final handoff.
- Deploy to production only after checks pass and verify the deployed Worker version plus a basic production health request.
- Never print or commit secrets from `.env.prod`.

Use Cloudflare logs and the existing diagnostic script when useful:
`pnpm --dir apps/api exec node --experimental-strip-types scripts/diagnose-session.ts --url <chat-url> --env prod`

At final handoff, report:

- exact failures prevented/recovered;
- remaining hard limits or unavoidable user-visible cases;
- JJ revisions created;
- tests run;
- deployed Worker version;
- production verification result.
