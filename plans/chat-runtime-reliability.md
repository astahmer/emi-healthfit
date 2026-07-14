# Chat runtime reliability plan

## Context

The chat UI is built on `@assistant-ui/react` + `@assistant-ui/react-ai-sdk`. The assistant runtime owns message state, streaming, and rendering primitives. We already use xstate for conversation/threading state (`conversation-machine`) and URL-driven session selection.

Recent fixes:
- `conversation-machine` now skips loading for a freshly-created conversation id and increments `resetKey` on new-chat.
- `app/chat/page.tsx` uses a `chatKey` + `resetKey` remount strategy so New Chat resets the runtime and created-session URL sync does not remount it.
- Backend `buildAssistantParts` now reads separate `role: "tool"` messages so tool results are persisted.
- Backend `streamText` now uses `stopWhen: isLoopFinished()` so the model continues after tool calls instead of stopping at `finishReason: "tool-calls"`.
- Tool result UI only renders when a result is actually present.
- Reference repos added: `shadcn-ui`, `ai-sdk`.

## Goal

Make the chat feel reliable: messages never get stuck, tools produce answers, switching sessions is instant, and a page refresh never loses in-flight progress.

## What we learned this session

1. **Assistant-ui message state does not reset automatically.** `useChatRuntime` creates a single `Chat` instance keyed by an internal id. Changing `messages`/`sessionId` props does not recreate it, which is why New Chat used to show the previous session's messages.
2. **The creation flash was caused by two things:**
   - `conversation-machine` went into `loading` when the created id appeared.
   - `ErrorBoundary` key included `activeConversationId`, so the runtime remounted when the URL synced.
3. **Backend tool loop was broken by design.** `streamText` defaults to `stopWhen: isStepCount(1)`. With that default the model stops immediately after emitting tool calls and never sees the results, so the frontend received tool outputs but no final answer.
4. **Tool results were dropped on persistence.** `event.response.messages` stores tool results as separate `role: "tool"` messages, but the old persistence code only looked at `role: "assistant"` content.
5. **Assistant-ui couples too many concerns.** Transport, runtime state, and primitives are bundled. Debugging required reading internal `useChatRuntime`, `useRemoteThreadListRuntime`, and AI SDK `streamText` source.
6. **Streaming with `isLoopFinished()` works correctly.** Investigated the full pipeline: AI SDK `stitchableStream` streams each step's chunks immediately via `addStream()` + `controller.enqueue()`. `toUIMessageStreamResponse()` pipes through `JsonToSseTransformStream` → `TextEncoderStream` with no buffering. Client `parseJsonEventStream` yields chunks as they arrive. The "streaming feels broken" perception is UX: step 0 only emits tool-call/tool-input-delta chunks (no visible text), then after tool execution pause, step 1 streams the final text — making it appear non-streaming even though it is.

## Bugs still open

| Bug | Severity | Root cause | Fix needed |
|-----|----------|------------|------------|
| Refresh does not resume an in-flight generation | High | No resumable stream backend or storage | Implement resumable stream adapter |
| Runtime reset on session switch is a workaround, not a solution | Medium | Message state lives inside assistant-ui runtime | Own message state or move to a simpler ai-sdk integration |
| Follow-up suggestions may not appear after tool-only answers | Low | Suggestions are generated from `event.text`; if text is empty after tool loop, suggestions key/text may be off | Use final assistant text + last user message, or disable suggestions when there is no text |
| Composer draft could be lost across remounts | Low | `ComposerDraftSync` runs once; a fast remount during an edit may snapshot an empty composer | Move draft to machine context or sync on every change |

## Recommended path forward

### Short term (this week)

1. **Ship the current fixes and verify in production.** The `stopWhen` change is the highest-impact fix. Confirm that a message like "make me a program for the week" now produces a visible answer after the tools complete.
2. **Add backend observability.** Log each `streamText` step, finish reason, and the assistant parts produced by `buildAssistantParts`. If a generation gets stuck again we will know whether it is the model, the tool loop, or the UI.
3. **Add an end-to-end API test for multi-step tool use.** Mock the OpenAI provider responses so we can assert: tool calls are emitted, tool results are returned, model continues, final text is streamed, and persisted messages contain tool results + text.

### Medium term (next 2–4 weeks)

4. **Implement resumable streams.** Two candidate approaches:
   - Use [`@vercel/resumable-stream`](https://github.com/vercel/resumable-stream) with `AssistantChatTransport` resumable adapter. The backend stores chunks and the client reconnects with a `streamId`.
   - Use [`ai-resumable-stream`](https://github.com/zirkelc/ai-resumable-stream) as a higher-level wrapper around `streamText`.
   Either way, the worker needs:
   - A `streamId` generated at request start.
   - A KV/D1 table that stores the stream checkpoint.
   - A `/api/chat/resume/:streamId` endpoint.
   - Frontend transport config updated to use `resumeApi`.
5. **Decouple message state from assistant-ui.** Introduce a thin xstate machine (or extend `conversation-machine`) that owns:
   - Current message list.
   - Streaming status (idle/loading/tool-calls/text).
   - Tool call results.
   Use AI SDK `useChat` or a custom fetch directly, and feed the machine from stream events. This removes the need for `chatKey` remount hacks.
6. **Replace assistant-ui primitives with shadcn chat components.** The new shadcn chat primitives (`MessageScroller`, `Message`, `Bubble`, `Attachment`, `Marker`) plus [`@shadcn/helpers/ai-sdk`](https://ui.shadcn.com/docs/helpers/ai-sdk) are designed for exactly this. Keep `ai-sdk` elements (`@ai-sdk/react` / `elements.ai-sdk.dev`) as a fallback for complex streaming patterns.

### Long term (1–2 months)

7. **Remove `@assistant-ui/react` entirely.** Once the custom runtime + shadcn primitives cover:
   - Message list and scrolling
   - Composer with attachments
   - Tool call rendering
   - Branching/forking (already in `conversation-machine`)
   - Resumable streams
   Delete assistant-ui dependencies.
8. **Add explicit state-machine-driven tests for impossible states.** With xstate owning the runtime we can assert you cannot be "streaming" and "loading history" at the same time, which is the class of bug that caused the creation flash.

## Tech choices

| Choice | Decision | Rationale |
|--------|----------|-----------|
| Keep assistant-ui for now | Yes | A full rewrite would delay the fix for the stuck-tool bug. Migrate incrementally. |
| Use `stopWhen: isLoopFinished()` | Yes | One-line fix that makes the current tool loop work without changing frontend code. |
| Resumable stream library | TBD between `@vercel/resumable-stream` and `ai-resumable-stream` | Need to compare Cloudflare Worker compatibility and storage requirements. |
| Future primitives | shadcn chat primitives + `@shadcn/helpers/ai-sdk` | Gives full control, aligns with existing shadcn/ui usage, and is not tied to assistant-ui's runtime. |
| Future state owner | xstate | Already used for conversation/threading; can model streaming and tool execution explicitly and prevent invalid states. |

## Implementation steps

1. Deploy current fixes and monitor the tool-loop behavior.
2. Add backend logging around `streamText` steps and `buildAssistantParts` output.
3. Write an API test that mocks the provider and verifies multi-step tool flow.
4. Spike resumable stream integration in a branch.
5. Design the custom runtime machine and migrate one component at a time (message list first, composer second, tool rendering third).
6. Swap assistant-ui primitives for shadcn chat primitives once the runtime is independent.
7. Remove assistant-ui and add end-to-end state-machine tests.

## Open questions

1. Does `@vercel/resumable-stream` run cleanly in a Cloudflare Worker, or do we need `ai-resumable-stream`?
2. Should tool results be stored as separate `role: "tool"` messages in D1, or kept embedded inside the assistant message parts?
3. How should the UI represent a resumed stream — show a spinner on the last assistant message or replay chunks?

## Acceptance criteria

- [ ] A message that triggers tools always ends with a visible assistant answer.
- [ ] Refreshing the page during a generation reconnects and finishes the answer.
- [ ] New Chat resets the view instantly with no previous messages.
- [ ] Switching sessions does not require a full runtime remount.
- [ ] Tool results are visible both during the stream and after refresh.
- [ ] No impossible UI states (loading + streaming, stale messages after New Chat, etc.).

## Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-14 | Fix tool loop with `stopWhen: isLoopFinished()` | Default `isStepCount(1)` was causing the model to stop after tool calls. |
| 2026-07-14 | Extract `buildAssistantParts` and read `role: "tool"` messages | Tool results are delivered as separate messages in AI SDK v6. |
| 2026-07-14 | Use `chatKey` + `resetKey` to remount assistant-ui runtime | Assistant-ui does not reset message state on prop changes. |
| 2026-07-14 | Plan incremental migration away from assistant-ui | Full control over runtime, streaming, and primitives is needed to avoid this class of bugs. |
| 2026-07-14 | Investigated streaming with `isLoopFinished()` — confirmed no buffering issue | Full pipeline traced: AI SDK `stitchableStream` streams immediately, `toUIMessageStreamResponse` pipes SSE without buffering, client parses as chunks arrive. "Feels non-streaming" is UX: step 0 only emits tool-call chunks (no text), then step 1 streams the final answer. |
