# Session diagnostics plan

## Current finding

Stored conversation messages already preserve tool calls, tool outputs, model, and token usage, so a
signed-in browser can inspect an old session. They do not preserve a complete server timeline:
request ids, generation ids, provider finish reasons, retries, chunk timing, persistence failures,
and logs are split between D1 and ephemeral Worker logs.

## Target

An owner can export one redacted diagnostic bundle for a conversation. A developer or automated
agent can analyze that bundle without database access, browser cache inspection, or a reusable
authentication secret.

## Bundle contents

- conversation, thread, message, and generation ids;
- ordered message parts including tool input/output and structured tool errors;
- model and per-turn token usage;
- generation status, timestamps, reconnect count, and persisted chunk summary;
- request and trace ids joining messages, generations, tools, and Worker logs;
- tool name, duration, outcome, and redacted error details;
- provider finish reason, retry count, time to first token, and total duration;
- client events relevant to recovery: submit, disconnect, reconnect, stop, and refresh.

Never include cookies, OAuth tokens, provider keys, raw request headers, or unredacted health-data
exports. Tool arguments and outputs are personal data and remain owner-only.

## Implementation

1. Add append-only `chat_events` rows keyed by `user_id`, `conversation_id`, `generation_id`, and a
   request id. Keep event payloads schema-versioned and bounded.
2. Log the same ids on every Worker span. Stop swallowing `onFinish`, title, suggestion, and
   persistence failures; classify critical persistence separately from optional enrichment.
3. Add `GET /api/conversations/:id/diagnostics` through the owned conversation repository. Return a
   versioned JSON bundle and record the export action.
4. Add **Export diagnostics** to the conversation menu. Download locally; do not send it elsewhere.
5. Add `pnpm diagnose:session path/to/bundle.json` for deterministic checks: orphan user turns,
   repeated identical tool failures, unsupported claims, abnormal token growth, incomplete
   generations, and persistence/reconnect gaps.
6. Add retention controls. Keep compact event metadata longer than raw chunk bodies and let the
   owner delete both with the conversation.
7. Add fixture bundles and regression tests for successful, tool-failed, disconnected, timed-out,
   and provider-failed sessions.

## Immediate browser fallback

Until the bundle exists, use the signed-in conversation page to inspect persisted messages and tool
cards, then correlate the conversation id with Worker logs. Browser inspection can reveal product
behavior but cannot reliably distinguish provider failure, Worker cancellation, or failed D1
persistence after the fact.
