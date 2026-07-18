# Split the chat route at meaningful boundaries

- **Status**: TODO
- **Commit audited**: `f163cac`
- **Scope**: `apps/api/src/routes/chat.ts` (992 lines)

## Problem

`routes/chat.ts` currently combines wire decoding, UI-message validation, attachment validation, conversation/thread loading, persistence, diagnostic events, AI tool invocation, provider callbacks, stream persistence, and resume handlers. `persistGenerationStream` is already separated logically at line 795, but remaining orchestration is still too large to safely review as one unit.

## Target layout

| Module | Responsibility |
| --- | --- |
| `chat-request-codec.ts` | Effect schemas for request/revision/diagnostic JSON and attachment validation |
| `chat-history.ts` | conversation/thread lookup, branch context, message reconstruction, replacement validation |
| `chat-generation-lifecycle.ts` | maintenance, generation creation, structured provider completion/failure events |
| `chat-tool-execution.ts` | repeat-failure breaker, tool event/log emission, `executeTool` adapter |
| `chat-stream-persistence.ts` | chunk persistence and completion reconciliation (move existing `persistGenerationStream`) |
| `routes/chat.ts` | public HTTP handlers and short orchestration only |

Keep `handleAiSdkChat`, `handleChatResume`, `handleMessageRevision`, and diagnostic handler exports stable so `api.worker.ts` does not change behavior. Each new effectful function uses `Effect.fn` and one object argument.

## Steps

1. Apply `api-slop-cleanup.md` request codecs first; extraction must not preserve unsafe `JSON.parse` or casts.
2. Move the pure schemas/attachment helpers from `routes/chat.ts:64-266` into `chat-request-codec.ts`, with focused malformed JSON and attachment-limit tests.
3. Extract conversation/thread history assembly from lines 324-460 into `chat-history.ts`. Keep branch ordering and replacement semantics byte-for-byte tested.
4. Extract the tool breaker/event adapter from lines 464-581. The existing breaker remains a canonicalized Set; do not add a schema where data is already internal.
5. Move `persistGenerationStream` from lines 795-922 into `chat-stream-persistence.ts`, then extract provider `onError`/`onFinish` lifecycle code into `chat-generation-lifecycle.ts`.
6. Leave route orchestration in `routes/chat.ts` under roughly 300 lines: decode → authorize/load → persist → create stream response.
7. Add one focused test per extracted module before formatting. Retain `chat-safety`, stream timing, tool-loop, resume, and generation persistence tests.

## Boundaries

- Do not split by arbitrary line count or create a generic `utils` module.
- Do not parallelize ordered provider chunks or generation lifecycle transitions.
- Preserve CORS, response status, diagnostic event names, and correlation IDs.
- No SQL migrations belong in this refactor.

## Verification

- Run the API chat test files individually with `--run`, then `pnpm --filter chat test:e2e`.
- Compare streamed chunk order, persisted assistant parts, tool failure blocking, branch replacement, stop/reload/resume behavior.
- Run API typecheck, lint, and format after the extraction series.
