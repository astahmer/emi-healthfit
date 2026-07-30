# 001 — Extract the generic chat runtime and UI primitives

- **Status**: TODO
- **Commit**: b131a3b
- **Severity**: HIGH
- **Category**: Maintainability & architecture
- **Rule**: react-doctor/no-giant-component
- **Estimated scope**: 12–16 files, medium-to-large

## Problem

`apps/generic-web/src/app.tsx:33` is an 877-line component. It owns remote conversation operations, stream cancellation and resumption, session transitions, browser persistence, scrolling, sidebar state, and all generic chat rendering. This prevents the generated app from being a thin configuration layer and duplicates the exact state boundary that `@emi/core/web` should supply.

    // apps/generic-web/src/app.tsx:33 — current shape
    export const App = () => {
      const [session, dispatchSession] = useReducer(reduceChatSession, initialChatSession);
      const [conversations, setConversations] = useState<Conversation[]>([]);
      const [threads, setThreads] = useState<ConversationThread[]>([]);
      const [memories, setMemories] = useState<Memory[]>([]);
      // stream transport, persistence, navigation, sidebar, messages, composer
    };

The scanner flags this component as `react-doctor/no-giant-component` at `apps/generic-web/src/app.tsx:33`. Its canonical target is: “Pull each section into its own component so the parent is easier to read, test, and change.”

## Target

Make `generic-web` a configuration and composition root. Export a reusable runtime hook and presentational primitives from `@emi/core/web`.

    // apps/generic-web/src/app.tsx — target shape
    export const App = () => {
      const chatRuntime = useChatRuntime({ client, settingsStorageKey, api });
      return <GenericChatApp config={genericChatAppConfig} runtime={chatRuntime} />;
    };

The runtime owns all legal chat transitions. It uses one reducer for durable interaction state and one focused reducer for independently changing sidebar query/input state. Do not merge those reducers: session transitions are protocol state, while search and memory input are local view state with different reset rules.

## Repo conventions to follow

- Export public browser APIs only from `packages/core/src/web/index.ts`.
- Keep reusable message state as a pure reducer, matching `apps/generic-web/src/chat-session.ts:63`.
- Decode remote boundaries with Effect Schema, matching `apps/generic-web/src/conversation-client.ts:6`.
- Keep feature configuration local to the generated app in `apps/generic-web/src/app-config.ts`.
- Use object arguments for callable APIs and arrow functions.

## Steps

1. Move `ChatSession`, `ChatSessionAction`, `initialChatSession`, and `reduceChatSession` from `apps/generic-web/src/chat-session.ts` to `packages/core/src/web/chat-runtime/session.ts`. Preserve all current transitions and tests; extend reducer tests to explicitly cover fresh start, conversation open, thread open, stream replacement, queue force-send, and errors.
2. Move generic API DTO schemas and the conversation/memory/thread HTTP client from `apps/generic-web/src/conversation-client.ts` to `packages/core/src/web/chat-runtime/client.ts`. Parameterize the API origin rather than reading `import.meta.env` in core.
3. Add `useChatRuntime` in `packages/core/src/web/chat-runtime/use-chat-runtime.ts`. It owns stream operation IDs, abort controller lifecycle, resume, send, queue force-send, conversation actions, branch operations, memory operations, online state, and draft/settings persistence. Its inputs are explicit adapters: `client`, `transportFactory`, `settingsStorage`, `settingsStorageKey`, and configuration defaults. Do not expose `setState` functions; expose state plus named commands.
4. Keep the stream operation counter and abort controller inside the runtime, with the cancellation invariant: only the active operation may update session state or clear streaming. Preserve current resume and forced-send behavior from `apps/generic-web/src/app.tsx:135-343`.
5. Split generic UI into core primitives with small, explicit props: `ChatSidebar`, `ConversationList`, `MemoryPanel`, `MessageViewport`, `MessageMinimap`, `ScrollControls`, `FollowUpQueue`, and `ChatComposer`. Put them under `packages/core/src/web/chat-ui/`. They receive runtime state and commands; they make no HTTP calls or direct storage reads.
6. Move generic chat styles alongside the generic app only if they remain intentionally customizable. Keep component semantics and class hooks stable during the extraction; do not add a styling framework.
7. Reduce `apps/generic-web/src/app.tsx` to config construction and primitive composition. Keep `genericChatAppConfig`, Vite environment access, and the browser-specific transport factory there.
8. Export only the intended runtime types, hook, client factory, and UI primitives from `packages/core/src/web/index.ts`. Add a core entry-isolation test proving these exports do not import the HealthFit flavor or either application.
9. Add focused core tests for reducer/runtime behavior and generic-web integration tests for: sending, cancelling, queued force-send, opening a conversation, opening a branch, and restoring an offline draft.

## Boundaries

- Do NOT merge sidebar query/input state into protocol session state.
- Do NOT move app name, release notes, browser storage key, Vite environment reads, or app-specific visual theme into core.
- Do NOT change API request/response contracts, persisted data, feature behavior, or add dependencies.
- Do NOT use context as a replacement for explicit runtime props until more than one independent consumer needs it.
- STOP if an existing core export needs an API break; add a new export and migrate callers deliberately instead.

## Verification

- **Mechanical**: run `npx react-doctor@latest --scope changed`; the giant-component diagnostic for `apps/generic-web/src/app.tsx` must clear and the score must not regress. Run `pnpm --dir packages/core typecheck`, `pnpm --dir apps/generic-web typecheck`, focused core/generic-web tests, then `pnpm release:check`.
- **Behavior check**: in generic web, configure BYOK, send a message, stop a stream, queue and force-send a follow-up, open an existing conversation, open a branch, compact a conversation, and reload while offline with a draft. All visible behavior remains unchanged.
- **Performance check**: use React DevTools Profiler and Highlight Updates while typing a draft. Confirm sidebar/history and message viewport do not redraw for a draft-only update.
- **Done when**: generic app is a thin composition root, core exposes the documented runtime/UI API, focused tests pass, and the Scanner diagnostic is gone.
