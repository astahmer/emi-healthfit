# State refactor plan — XState + TanStack DB

## Context

The chat frontend (`apps/chat`) currently manages a lot of UI state with raw `useState`/`useEffect`/`useCallback`. The worst offenders are:

- `app/chat/page.tsx` — session config, rename flow, sidebar width, created-session tracking, web-search/model fallback logic.
- `app/chat/session-sidebar.tsx` — search, inline rename, delete confirmation, copy-to-clipboard, sync.
- `app/providers.tsx` — tool registration lifecycle, URL sync race with `thread.isRunning`, thread creation ref.
- `app/upload.tsx` — file selection, upload status, success/error.
- `app/settings.tsx` — settings + manual sync status.

This leads to:

- Impossible states (e.g., `isRenaming` true while `renameDraft` is stale).
- Race conditions (URL sync depending on `isRunning` + a ref).
- Scattered effects that are hard to test.
- Ad-hoc optimistic/offline logic in `session-cache.ts` and `sessions.ts`.

## Goal

Make the chat UI robust and maintainable by:

1. Modeling async UI flows as explicit XState v5 machines.
2. Keeping local-only UI state simple (XState Store or plain React state when trivial).
3. Keeping offline/cache support stable without betting on beta software.

## What we will do

### 1. Adopt XState v5 for orchestration

**Packages:** `xstate`, `@xstate/react`.

**Keep assistant-ui as the chat runtime layer.** Do not wrap `useChatRuntime` / `AssistantRuntimeProvider` inside a machine. XState owns the app shell around it; assistant-ui owns message streaming, composer state, and tool execution.

**Machine boundaries:**

| Machine | Scope | Replaces |
|---|---|---|
| `chatSessionMachine` | Load/create session, rename, export, config changes | `app/chat/page.tsx` shell state |
| `sidebarMachine` | Search, sync, rename/delete/copy per item | `app/chat/session-sidebar.tsx` |
| `composerConfigMachine` | Model, coach mode, web search, temporary | `useSessionParam` + flags in `page.tsx` |
| `uploadMachine` | File selection, validation, upload, result | `app/upload.tsx` |
| `settingsSyncMachine` | Manual sync action status | `app/settings.tsx` sync button |
| `themeMachine` (optional) | Theme preference + system detection | `app/theme-provider.tsx` |

**What we will NOT machine:**

- Search input value alone (store or local state).
- Simple open/close flags for dropdowns (Radix already owns this).
- Settings form fields (Zustand is fine).

### 2. Keep TanStack Query + Dexie for data today

**TanStack DB is beta.** `@tanstack/db@0.6.x` and `@tanstack/react-db@0.1.x` are explicitly not production-ready, and there is no official Dexie adapter. The current `Dexie` cache + `@tanstack/react-query` combo is stable and works.

**Decision:** do not migrate the data layer to TanStack DB now. Continue using:

- `@tanstack/react-query` for server-state orchestration.
- `Dexie` (`app/session-cache.ts`) as the IndexedDB fallback.
- `sessions.ts` as the API boundary.

**Future option:** when TanStack DB reaches stable 1.x and a Dexie/IndexedDB adapter exists, evaluate `@tanstack/query-db-collection` for thread/message data. Until then, the risk outweighs the benefit.

### 3. Migration phases

#### Phase 0 — Setup ✅

- Add `xstate` and `@xstate/react`.
- Add one helper for typed machine events if needed.
- Keep all existing tests green.

#### Phase 1 — Isolated PoC (upload) ✅

- Extract `uploadMachine` from `app/upload.tsx`.
- Rewrite `UploadPanel` with `useMachine`.
- Add unit tests for the machine.
- Verified: `pnpm typecheck`, `pnpm test`, `pnpm lint` pass in `apps/chat`.

#### Phase 2 — Sidebar ✅

- Introduce `sidebarItemMachine` for rename/delete/copy per item.
- Replace `editingId`, `editTitle`, `deletingId`, `copiedId` `useState` flags in `SessionSidebar`.
- Keep React Query for the thread list query; use the machine for UI orchestration.
- Move delete confirmation dialog into `SidebarItem`.
- Add unit tests for `sidebarItemMachine`.
- Verified: `pnpm typecheck`, `pnpm test`, `pnpm lint` pass in `apps/chat`.

#### Phase 3 — Chat session shell ✅

- Introduce `chatSessionMachine` in `app/chat/page.tsx`.
- Move rename flow, export, sidebar width persistence, created-session tracking, and URL sync into the machine.
- Remove `UrlSync` component from `app/providers.tsx`; page now owns URL sync via `useAuiState`.
- Add unit tests for `chatSessionMachine`.
- Verified: `pnpm typecheck`, `pnpm test`, `pnpm lint` pass in `apps/chat`.

#### Phase 4 — Composer config ✅

- Extract model/coach/web/temporary config into `composerConfigMachine`.
- Encapsulate the web-search → model-swap fallback logic in machine actions.
- `page.tsx` syncs machine context back to URL params via a single focused `useEffect`.
- Add unit tests for `composerConfigMachine`.
- Verified: `pnpm typecheck`, `pnpm test`, `pnpm lint` pass in `apps/chat`.

#### Phase 5 — Settings sync ✅

- Add `settingsSyncMachine` for the manual sync button.
- Refactor `SettingsPanel` sync button to use `useMachine`.
- Add unit tests for `settingsSyncMachine`.
- Verified: `pnpm typecheck`, `pnpm test`, `pnpm lint` pass in `apps/chat`.

#### Phase 6 — Cleanup ✅

- Remove dead `use-thread-data.ts` + test (replaced by `chatSessionMachine`).
- Remove `ExportThreadButton` component (export is now inline in `ChatPage`).
- Audit remaining hooks; keep only trivial local state or necessary bridges.
- Verified: `pnpm typecheck`, `pnpm test`, `pnpm lint` pass in `apps/chat`.

## What was intentionally left as local state

| File | State left | Reason |
|---|---|---|
| `app/chat/session-sidebar.tsx` | `search` | Pure input value, no async lifecycle. |
| `app/chat/page.tsx` | URL param hooks + 3 `useEffect` bridges | URL params must stay the React source of truth; effects sync params ↔ machines. |
| `app/providers.tsx` | `ToolRegistrar` tool loading | Async lifecycle is simple; registration effect is a bridge to assistant-ui. |
| `app/theme-provider.tsx` | theme + localStorage | Standard pattern, low value to machine. |
| `app/notes-panel.tsx` | form inputs | Local form state, no complex async flow. |
| `app/memory-panel.tsx` | form inputs | Local form state, no complex async flow. |
| `app/workouts/page.tsx` | search + expandedId | Local list UI state. |
| `app/gen-ui/page.tsx` | carousel index | Local carousel state. |
| `app/upload.tsx` | 1 `useEffect` for file input reset | DOM sync bridge after machine success. |
| `app/query-provider.tsx` | `QueryClient` init | One-shot stable instance. |
| `app/service-worker-reload.tsx` | service worker listener | External event bridge. |

## Architecture

```
┌─────────────────────────────────────────────┐
│              React components               │
│  useMachine/useSelector/useActorRef        │
├─────────────────────────────────────────────┤
│  XState machines (shell orchestration)      │
│  chatSession / sidebar / upload / settings  │
├─────────────────────────────────────────────┤
│  assistant-ui runtime (chat internals)      │
│  useChatRuntime / useAuiState / useAui      │
├─────────────────────────────────────────────┤
│  Data layer (unchanged for now)             │
│  @tanstack/react-query + Dexie + REST       │
└─────────────────────────────────────────────┘
```

## What this allows

- Explicit states make impossible states unrepresentable.
- Async side effects live in `invoke` actors, not scattered `useEffect`.
- Easier unit testing of state logic independent of React.
- Clear boundaries between UI orchestration, chat runtime, and data fetching.

## What this does not allow

- XState will not replace assistant-ui's runtime; do not try to drive streaming from a machine.
- This plan does not deliver a fully offline-first sync engine; it keeps the current Dexie fallback.

## UI & UX

No visual changes. The refactor should be behavior-preserving except where it fixes existing race conditions.

## Data model

No server data model changes. Machine context mirrors existing local state shapes.

## Implementation steps

1. Add XState dependencies.
2. Implement `uploadMachine` + tests + refactor `UploadPanel`.
3. Implement `sidebarItemMachine` and integrate into `SessionSidebar`.
4. Implement `chatSessionMachine` and integrate into `ChatPageInner`.
5. Implement `composerConfigMachine`.
6. Implement `settingsSyncMachine`.
7. Audit and remove leftover `useState`/`useEffect`.
8. Run full check suite: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm fmt`.

## Open questions

- Should the sidebar use one machine per item or one machine for the whole list? Per item is simpler; whole list may be needed if cross-item operations grow.
- Should we keep Zustand for settings or migrate settings to XState Store? Keep Zustand for persistence; add a sync machine on top.
- When TanStack DB stabilizes, do we want a spike to compare it against the Dexie cache?

## Acceptance criteria

- `xstate` and `@xstate/react` installed.
- At least upload, sidebar, and chat session machines landed.
- No regressions in existing tests.
- No new `useState`/`useEffect` spaghetti in refactored components.
- All checks pass.

## Decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-14 | Use XState v5 | Stable, React 19 compatible, explicit state fits the problem. |
| 2026-07-14 | Keep assistant-ui runtime separate | No official XState integration; wrapping it would fight its own state. |
| 2026-07-14 | Keep Dexie + TanStack Query, defer TanStack DB | TanStack DB is beta; no official Dexie adapter; current cache works. |
