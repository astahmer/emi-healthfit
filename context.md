# Thread view layer dedupe audit — apps/chat vs @emi/core

Read-only audit. Base revision: `lmrmtpru` ("core: move conversation machine policy out of apps/chat"), working copy `nuyuutwo`.

## Core inventory (already exported by `@emi/core/web`)

`packages/core/src/web/thread/` → re-exported in `packages/core/src/web.export.ts` (lines 65-85, 156-211), listed in `packages/core/source-manifest.json` lines 262-274:

| Primitive | File | Notes |
|---|---|---|
| `ThreadMessage`, `ThreadMessageValue`, `ThreadMessageMetadata`, `ThreadMessageProps` | thread-message.tsx (344 ln) | full message bubble: fork, remember, edit, regenerate, retry, copy/export, `renderToolResult` hook |
| `MessagePart`, `ToolPart`, `MessagePartValue` | message-part.tsx, tool-part.tsx | schema-parsed tool part rendering |
| `ToolResultContent` (+ optional `renderComponent`) | thread/tool-result-content.tsx (148 ln) | memoized; citations/error-text/warning-text parsing via Effect Schema; internal `FallbackResult` NOT exported |
| `MessageRail`, `formatMessageRailTime`, `MessageRailItem` | message-rail.tsx | |
| `SuggestionChips` | suggestion-chips.tsx | pure presentational |
| `MarkdownText` + markdown-url-policy | markdown-text.tsx | reference-message link context |
| `ChatThreadScroll`, `useThreadViewportScroll`, `ThreadViewportScroll` | chat-thread-scroll.ts, use-thread-viewport-scroll.ts | DOM adapter; actor owns policy |
| `threadViewportActor`, `threadViewportNeedsInitialPosition` | thread-viewport-actor.ts | scroll-position XState actor |
| `ThreadViewport` component, `ThreadViewportProps` | thread-viewport.tsx, types.ts | **unused by apps/chat** |
| `ComposerControls`, `ComposerModelOption` | types.ts | includes `coachMode`, `webSearch`, `temporary`, `onKeepTemporary`, `canWebSearch` |
| `resolveQueueEditTarget`, `shouldHandleQueueArrowKey` | web/chat-runtime/follow-up-queue-navigation.ts | queue keyboard logic |

Core also has follow-up-queue runtime state (`packages/core/src/runtime/types.ts`, `create-chat-runtime.ts`: `queuedFollowUps`, `editingQueuedId`, `beginEditingQueuedFollowUp`, `forceSendQueued`, `removeQueuedFollowUp`, `clearQueuedFollowUps`) — the queue *state* is core-owned already; only its UI is app-side.

## Per-file verdict table (apps/chat/components/chat/)

### 1. `thread.tsx` (23 ln) — **stays** (trim)
- Thin composition: `<ThreadMessageList/> + <ThreadComposer/>` in a flex column.
- No core duplicate of this exact composition (core `ThreadViewport` is slot-based and unused here).
- Debt: `export type ComposerControls = ThreadComposerControls` is a pure alias re-declaration; consumers could import from `./thread-types` directly.
- Symbols to touch: none required.

### 2. `thread-types.ts` (9 ln) — **stays**
- Narrows core `ComposerControls`: `onKeepTemporary: (messages: ChatUiMessage[]) => Promise<void>`, `models: ChatModel[]`.
- Product-specific typing over generic contract. Optional future move: parameterize core type (`ComposerControls<TMessage, TModel>`); low value now.

### 3. `thread-composer.tsx` (99 ln) — **mostly stays; extract key handler to core**
- Form shell, textarea, paste-to-attach, product styling (rounded card, safe-area padding).
- Generic logic embedded inline in `onKeyDown` (~40 ln): arrow-up/down queue-edit traversal, Escape cancels edit, Enter submits (desktop only), Shift+Enter interrupts streaming. All inputs are plain values already handled by core helpers (`shouldHandleQueueArrowKey`, `resolveQueueEditTarget`).
- Recommendation: move a pure `resolveComposerKeyEvent({key, draft, selectionStart, queuedFollowUps, editingQueuedId, isMobile, isSending, isStreaming}) => action` into `@emi/core/web` next to `follow-up-queue-navigation.ts`; JSX stays. Symbols: new core export only.
- Hooks: none (no useState/useEffect/useRef). Clean per actor-ownership.

### 4. `thread-composer-sections.tsx` (297 ln) — **move-to-core candidates after runtime-interface extraction**
All four sections take `runtime: ChatRuntimeValue` from `@/app/chat/chat-runtime-context` (app-owned context type). That's the blocker for moving them.
- `ComposerAttachments` (L29-60): attachment preview strip + "Optimizing attachments…" + attachment error. Generic shape over `runtime.files/removeFile/isPreparingAttachments/attachmentError`. **Move-to-core**: needs a structural props/runtime interface in core.
- `ComposerQueue` (L62-119): queued follow-up rows with Edit / Send now / Cancel / Clear queue. Queue state machine + navigation helpers already in core; this is the last queue piece outside core. **Strongest move-to-core candidate**. Symbols: `ComposerQueue`.
- `ComposerError` (L121-160): error banner with orphan-retry / retry-last-turn / dismiss, driven by `runtime.error/errorMessageId/orphanMessageId/retryOrphan/revise/clearError`. Generic behavior. **Move-to-core** alongside ComposerQueue.
- `ComposerToolbar` (L162-296): attachments button, model Select, Coach toggle, Web toggle, Temporary/Keep toggle, send button state machine (sending grace → stop → queue-after-reply). `coachMode`/`webSearch`/`temporary` are already fields of core's `ComposerControls` — so even the "Coach" button is generic-contract driven. Only labels/icons are product-ish. **Move-to-core candidate**, or split: generic toolbar to core, keep nothing app-side except styling overrides.
- Hook debt: one `useState(false)` for `isKeepingTemporary` (L170) — transient async-in-flight flag on a fire-and-forget promise. Per actor-ownership.md this is borderline: it is async status of a domain operation ("keep temporary") and ideally belongs in an actor; as a disposable visual toggle it's defensible but flag as debt.

### 5. `thread-message-list.tsx` (452 ln) — **split: generic scaffolding moves, product wiring stays**
Already correctly consumes core primitives (`ThreadMessage`, `MessageRail`, `useThreadViewportScroll`, `ChatThreadScroll`, `SuggestionChips`). Remaining pieces:
- **Move-to-core**: `messageEditorMachine` (L39-69) — generic XState edit-draft machine, zero product vocabulary; `getText` (L71-75), `toThreadMessage` (L77-81), `hasVisibleContent` (L83-89) — generic `ChatUiMessage → ThreadMessageValue` adapters; `StreamingIndicator` (L91-104) — generic "Thinking" dots.
- **Stays (product)**: hardcoded empty-state `suggestions` array (L32-37, HealthFit copy); `FollowUpSuggestions` (L106-149) — react-query + `fetchSuggestions` (@/app/suggestions) + settings apiKey/baseUrl/model config = product fetch wiring (core has suggestions-actor but this composes it app-side); memory wiring `rememberMessage`/`savedMemoryMessageIds`/`MemoryDomain`/`notifyMemoriesChanged` (HealthFit memory feature — presentation hooks `onRemember/isRemembered/isRemembering` are already generic core props, so the split is correct); usage metadata lookup (`useUsage`, modelLabel/tokens); `incompleteUserMessage` recovery block (product copy "Coach did not finish this reply", but the pattern is generic — parameterize later); `assistantLabel="Coach"`.
- **Debt/duplication note**: builds its own viewport `<div ref={viewportRef} … data-scroll-restoration-id={ChatThreadScroll.elementId}>` inline instead of using core's unused `ThreadViewport` component. Two viewport compositions now exist in the repo; either adopt `ThreadViewport` in chat or delete it from core. Also `memoryMessageId` useState (L162) mirrors `isRemembering` per-message — acceptable view-local pending-state mirror of an async Effect call, but strictly it is async status → actor debt per actor-ownership.md.
- The big render body (L151-451) passes ~25 props per message — if more generic callbacks accumulate, consider a core-level `ThreadMessageList` recipe that takes `{messages, runtime-like adapter}` slots. Not urgent.

### 6. `tool-result-content.tsx` (42 ln) — **stays**
- Exactly what thread-core-ownership.test.ts mandates: GenUI `render_component` wiring via `GenUIRenderer` from `@emi/flavor-healthfit/web` inside core `ToolResultContent`'s `renderComponent` hook, wrapped in app `ErrorBoundary`.
- Duplication found: local `FallbackResult` duplicates core's private `FallbackResult` markup (core thread/tool-result-content.tsx L79-88 ≈ app L9-18). Recommend exporting `FallbackResult` from core and deleting the app copy.
- No hooks. Clean.

### 7. Test files
- `thread-core-ownership.test.ts` (34 ln): source-scanning guard — asserts thread-message-list/thread-types/thread-composer-sections import from `@emi/core/web` (ThreadMessage, MessageRail, useThreadViewportScroll, ChatThreadScroll, SuggestionChips, CoreComposerControls, no react-markdown) and that GenUI wiring stays in the wrapper. **Must be updated with any move**; it is the ownership contract.
- `thread.test.tsx` (577 ln): behavioral suite covering queue UI (edit/send-now/cancel), streaming announce + live indicator, unfinished-reply recovery, empty-message filtering, typing indicator before first chunk, tool-part animation stop, persisted error-text outcomes, metadata restore, attachment preview/paste, Enter/mobile behavior, retry states, send-grace, composer error actions, memory feedback, regenerate. Mocks `useChatRuntime`, `MemoryDomain`, providers.
- `tool-result-content.test.tsx` (363 ln): GenUI render_component trees, persisted component variants/MetricCard contract, sleep-trend/workout-streak charts, empty states, parsed-string fallback.

### Tests to port when moving (test-before-broaden order)
1. Move `ComposerQueue`+`ComposerError` → port thread.test.tsx scenarios L99-126 (queue actions) and L502-526 (retry-last-turn/dismiss) into `packages/core/test/web/` first; delete app duplicates after green.
2. Move `StreamingIndicator` + typing-indicator timing → port L128-141, L178-193, L195-211.
3. Move `messageEditorMachine` → needs a direct actor behavioral test in core (none exists anywhere today — gap).
4. Export core `FallbackResult` → add core test mirroring app "renders parsed string results as preformatted text" (tool-result-content.test.tsx L357-361); core currently has **zero tests for its own tool-result-content.tsx** (citations parsing, memoization) — gap worth closing regardless.
5. `getText/toThreadMessage/hasVisibleContent` → trivial pure adapters; cover in core thread-message tests.
6. Existing core coverage to lean on: `packages/core/test/web/{message-rail,thread-message,thread-shell,tool-part,use-thread-viewport-scroll,thread-viewport-actor,chat-thread-scroll}.test.*`.

## create-chat-app coupling
- `packages/create-chat-app/src/templates.ts` contains **no references** to any `components/chat/*` or thread file — it only emits workspace/package.json/config/readme templates.
- Generated fixture copies canonical fixtures from apps/generic-web sources + owned core files; guardrail (`scripts/generate-chat-app-fixture.mjs` + `guardrails.ts` hash scan) checks copied core stays inside owned `core/`. `apps/chat/components/chat/**` are not template-owned, so moving/deleting them does **not** affect `pnpm --filter @emi/create-chat-app test:generated`.
- If new files land in `packages/core/src/web/thread/`, they must be added to `packages/core/source-manifest.json` (thread list at lines 262-274) and exported from `src/web.export.ts`; curated subpath `@emi/core/web` must stay stable (docs/architecture/core-boundaries.md).

## Risk notes
- **Streaming behavior**: typing indicator vs live-empty-assistant filtering (`isLiveEmptyAssistant`), "does not animate an unfinished tool after streaming ends", send-grace (`isSendGraceActive`) and Shift+Enter interrupt are subtle race behaviors covered only by app tests — port these scenarios verbatim before extracting anything they exercise.
- **Follow-up suggestions**: `FollowUpSuggestions` keys react-query on last assistant/user text with `staleTime: Infinity` and disables while streaming — moving the query policy without preserving key semantics would refetch per keystroke/stream tick.
- **Composer queue UI**: queue row actions bind directly to runtime methods; the runtime contract lives in core but `ChatRuntimeValue` is app-typed — moving sections requires defining a structural interface in core (risk: widening public API surface).
- **Viewport duplication**: two viewport compositions (app inline div vs unused core `ThreadViewport`); scroll restoration depends on `data-scroll-restoration-id={ChatThreadScroll.elementId}` — easy to lose in a refactor.
- **Architecture script**: apps/chat forbids export-from forwarding of core types; moved code must be imported directly from `"@emi/core/web"` with `as` aliases where names clash (existing pattern: `ComposerControls as CoreComposerControls`).

## Hook inventory (actor-ownership classification)
| File | Usage | Verdict |
|---|---|---|
| thread.tsx | none | clean |
| thread-types.ts | none | clean |
| thread-composer.tsx | none | clean |
| thread-composer-sections.tsx | `useState` isKeepingTemporary (L170) | debt (async status of keep-temporary op → actor candidate; tolerable as visual toggle) |
| thread-message-list.tsx | `useState` memoryMessageId (L162); `useMachine(messageEditorMachine)` | useState = mild debt (async remember status; per-message mirror OK short-term); useMachine = correct pattern (actor owns lifecycle) |
| tool-result-content.tsx | none | clean |
| No useRef/useEffect anywhere in components/chat/*.tsx | scroll refs correctly live in core `useThreadViewportScroll` adapter | matches actor-ownership.md adapter exception |

## Recommended execution order (future edits, not done in this pass)
1. Export core `FallbackResult` + add core tool-result-content tests → alias-and-delete app copy.
2. Extract pure composer key-resolution helper to core (new export, no UI move) + unit test.
3. Move `ComposerQueue` + `ComposerError` behind a structural core runtime interface; port queue/error scenarios to core tests; delete app versions.
4. Move `messageEditorMachine`, `getText`, `toThreadMessage`, `hasVisibleContent`, `StreamingIndicator` to core; add actor test for editor machine.
5. Decide fate of unused core `ThreadViewport` (adopt in chat or delete).
6. Update `source-manifest.json` + `web.export.ts` per move; run `pnpm --dir packages/core run build && pnpm --dir packages/core vitest run test/web`, `pnpm --dir apps/chat run typecheck`, scoped vitest, `node scripts/check-architecture-boundaries.mjs`.
