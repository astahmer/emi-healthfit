# 002 — Make React a projection of composed XState actors

- **Status**: TODO
- **Commit**: 5fc34be
- **Severity**: HIGH
- **Category**: Maintainability & architecture
- **Rule**: react-doctor/no-giant-component; Beyond the scan
- **Estimated scope**: 25–35 files, staged across several revisions

## Problem

`apps/generic-web/src/app.tsx:34` remains an 870-line React component. It owns XState session state plus browser persistence, transport cancellation, remote conversation/memory data, online state, scroll navigation, and all UI composition.

    // apps/generic-web/src/app.tsx:34 — current shape
    export const App = () => {
      const [sessionState, dispatchSession] = useMachine(chatSessionMachine);
      const [settings, setSettings] = useState<ChatSettings>(defaultChatSettings);
      const [conversations, setConversations] = useState<Conversation[]>([]);
      const [threads, setThreads] = useState<ConversationThread[]>([]);
      const [memories, setMemories] = useState<Memory[]>([]);
      const [online, setOnline] = useState(navigator.onLine);
    };

React Doctor reports `react-doctor/no-giant-component` at `apps/generic-web/src/app.tsx:34`. Its canonical target is: “Pull each section into its own component so the parent is easier to read, test, and change.” It also reports `react-doctor/prefer-use-sync-external-store` at `apps/generic-web/src/app.tsx:48`: browser connection state is an external event source, not component state.

The HealthFit application has overlapping actor boundaries in `chat-runtime-machine.ts`, `conversation-machine.ts`, and `sidebar-item-machine.ts`. Do not merge them wholesale: their persistence, domain UI, and lifetimes differ. Extract a generic actor protocol from common behavior, then compose it under the app actors.

## Target

React is a view adapter. `App` owns only DOM references, visual layout, and event wiring. It reads selected actor snapshots and sends named events; it owns no application state, fetch lifecycle, timers, or storage effects.

    // apps/generic-web/src/app.tsx — target shape
    export const App = () => {
      const appActor = useGenericChatAppActor({ config: genericChatAppConfig, adapters });
      const view = useSelector(appActor, selectGenericChatView);
      const composerRef = useRef<HTMLFormElement>(null);
      return <GenericChatAppView actor={appActor} view={view} composerRef={composerRef} />;
    };

The root composes focused actors. It communicates only through typed events and actor outputs:

```text
genericChatAppMachine
├── chatSessionMachine       durable interaction state and legal transitions
├── chatTransportActor       stream, reconnect, abort, operation identity, retry
├── conversationStoreActor   conversation/thread/memory query and mutations
├── settingsActor            hydrate, validate, persist browser-local configuration
├── browserStateActor        online/offline subscription and local draft lifecycle
└── chatUiActor              sidebar search, memory draft, selected panels, derived view state
```

`chatSessionMachine` already exists at `packages/core/src/web/chat-session-machine.ts`. The parent coordinates child lifetimes with `sendTo` and typed outputs. Components use `useSelector`, never mirror actor snapshot fields in `useState`.

## State ownership rules

| State                                              | Owner                                 | Reason                                                            |
| -------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Session, messages, queue, error, active branch     | `chatSessionMachine`                  | One legal transition model.                                       |
| Stream operation, abort, resume/retry              | `chatTransportActor`                  | Async cancellation must outlive a render and reject stale chunks. |
| Conversations, threads, memories, remote mutations | `conversationStoreActor`              | Request lifecycle, refresh, and failure are application behavior. |
| Settings and draft persistence                     | `settingsActor` / `browserStateActor` | Storage IO and hydration are external effects.                    |
| Online/offline status                              | `browserStateActor`                   | Browser events are external state.                                |
| Sidebar query, memory draft, open panels           | `chatUiActor`                         | Explicit reset and actor composition without remote effects.      |
| DOM elements and scroll handles                    | React refs                            | Imperative, non-serializable view handles.                        |

## Steps

1. Add `genericChatAppMachine` under `packages/core/src/web/chat-runtime/`; its context holds child actor references, not duplicated child snapshots. Export stable selectors and actor inputs through `@emi/core/web`.
2. Move `DefaultChatTransport`, stream operation ID, `AbortController`, reconnect, retry, `readUIMessageStream`, and forced queue send from `apps/generic-web/src/app.tsx:154-409` into `chatTransportActor`. It emits typed session events and rejects stale chunks internally.
3. Move the Effect Schema HTTP DTO client from `apps/generic-web/src/conversation-client.ts` into core. `conversationStoreActor` owns conversation/thread/memory list, load, and mutation operations. Inject API origin and fetch; core never reads Vite environment.
4. Move local-storage settings hydration/persistence to `settingsActor`, and the online/offline subscription plus local draft lifecycle to `browserStateActor` using `fromCallback`. This clears the direct React browser subscription diagnostic.
5. Add `chatUiActor` for search queries, memory draft, and selected sidebar panels. It has no HTTP calls; parent routes query events to `conversationStoreActor`. Do not put scroll coordinates or DOM elements in an actor.
6. Complete — extract `ChatSidebar`, `ConversationList`, `MemoryPanel`, `SettingsPanel`, `ChatHeader`, `MessageViewport`, `MessageMinimap`, `FollowUpQueue`, and `ChatComposer` into the optional `@emi/core/web/styled` entry. They receive selected view data and named callbacks; no component fetches or writes storage.
7. Complete — createActor coverage covers parent/child routing, cancellation, stale chunks, rejected mutations, branch open, and queue force-send; Playwright covers viewport containment and mobile drawer accessibility; generated-app acceptance runs a real Worker-through-Vite API smoke.
8. Migrate HealthFit incrementally: preserve `conversationMachine` and its HealthFit-only fields (`viewMode`, sidebar width, markdown export, domain callbacks); replace only shared generic runtime/transport with core actors.
9. In progress — core entry-isolation and generated-app source/acceptance tests now cover the public boundary; remove app-local aliases only after generic and HealthFit share the protocol.

## Boundaries

- Do NOT create actors for pure rendering, one-shot event handlers, or DOM references.
- Do NOT duplicate child snapshots in parent context; derive the view through selectors.
- Do NOT use React context as state storage; it may expose the root actor reference only.
- Do NOT merge generic and HealthFit machines by name or location. Extract shared protocols only after matching events, ownership, and failure semantics.
- Do NOT let core actors import Vite, React components, HealthFit, or browser globals. Pass platform APIs as adapters.

## Verification

- **Mechanical**: `npx react-doctor@latest --scope changed` clears generic `App`’s giant-component and external-store diagnostics; run focused actor tests then `pnpm release:check`.
- **Behavior**: configure BYOK; send, stop, resume, retry, queue/force-send; open branches; use every conversation action; manage memories; work offline with a restored draft.
- **Actor**: inspect snapshots in XState Inspector/tests. Only transport owns abort/operation state; only settings touches settings storage; React has no domain/application state.
- **Performance**: React DevTools Highlight Updates confirms sidebar/settings do not redraw for a draft-only update and message viewport does not redraw for an unrelated settings update.
