# Generic chat repair and extraction handoff

Continue in `/Users/astahmer/dev/emi-healthfit`.

## Objective

Make `apps/generic-web` and `apps/generic-worker` a polished, working canonical chat fixture. Keep React as a view adapter over the composed core actors, extract reusable presentation, and only migrate HealthFit behavior where the protocol is demonstrably shared.

## Read first

- `AGENTS.md`
- `plans/002-xstate-actor-architecture.md`
- `plans/001-core-web-chat-runtime.md`
- `plans/core-chat-platform.md`, especially **Current status and remaining migration slices**
- `improvements.md`
- `apps/generic-web/src/app.tsx`, `app.css`, and `vite.config.ts`
- `apps/generic-worker/src/generic.worker.ts`
- `apps/chat/app/chat/page.tsx`, `session-sidebar.tsx`, `chat-page-header.tsx`
- `apps/chat/components/chat/thread.tsx`, `message-rail.tsx`, and `apps/chat/components/ui/{sidebar,sheet,button,input,select}.tsx`

## Current state and revisions

The working copy was clean after `pnpm release:check` passed.

- `7ae95f9a` — conversation store actor
- `26306903` — generated app acceptance for store wiring
- `7aee9297` — settings actor
- `65f43266` — browser-state actor
- `b508ee7a` — chat UI actor
- `d3fbed30` — generic root composes settings/browser/UI actors; generic App no longer owns React state/effects
- `504efb0e` — docs progress
- `89c195d9` — generator no longer copies deleted local settings shim

Core root now composes six children under `genericChatAppMachine`:

```text
session · transport · conversationStore · settings · browserState · chatUi
```

Parent context must contain adapters and child refs only; never copy child snapshots into it. Core must not import browser globals, Vite, an app, or HealthFit. Browser and storage APIs remain injected adapters.

## Observed problems (screenshots from local generic web)

1. The current generic styling is a hand-rolled dark fixed settings column plus a sparse white canvas. Native-looking form controls, mismatched spacing/colors, and weak visual hierarchy make it look unfinished.
2. The page itself scrolls. Screenshot 2 shows the sidebar content escaping the viewport while the composer is at the bottom of a much taller document. The chat must be constrained to the available viewport; only intended inner regions may scroll.
3. A conversation request displays `Unexpected token '<', "<!doctype "... is not valid JSON`.
4. The left configuration/history surface permanently occupies desktop width and is unusable on small viewports. It must be a collapsible desktop sidebar and a mobile drawer/sheet.
5. Generic web/worker only have smoke/boundary tests. They need behavioral unit/integration/browser tests.

## Likely JSON failure: verify then fix

`apps/generic-web/src/app.tsx` creates the client with `apiOrigin: import.meta.env.VITE_API_ORIGIN ?? ""`. With the default empty origin, `/api/conversations` goes to Vite's SPA server, which returns `index.html`; `conversation-client.ts` then calls `response.json()`, producing the observed HTML/JSON parsing error.

Do not merely hide this error. Make local generic web + worker wiring explicit and testable:

- Choose and document one supported local topology: Vite dev proxy to local worker, or an explicit required `VITE_API_ORIGIN` pointing at local worker.
- Add a dev proxy only if the worker's local URL/port is stable and documented; otherwise validate/show a clear configuration error before attempting a request.
- In the core conversation client, fail with a useful API/proxy/origin error when a response expected to be JSON is HTML or has an unexpected content type. Preserve the server's structured `{ error }` message when present.
- Add a real integration test that fetches the generic worker's `/api/health` and `/api/conversations` through the same configured origin/proxy path used by generic web. It must prove no HTML fallback is decoded as JSON.

## Required implementation order

### 1. Fix generic fixture runtime and viewport first

- Make the app shell `100dvh` (with safe `100vh` fallback), `overflow: hidden`, and a two-column layout where the chat content can shrink (`min-width: 0`).
- Make message history the dedicated scroll region; keep header/composer visible. Sidebar content needs its own scroll region.
- Ensure mobile uses safe-area padding and the composer remains reachable while the virtual keyboard is open.
- Add browser tests for no document-level vertical overflow, scrollable message region, and mobile sidebar/drawer behavior.
- Fix the API-origin/proxy error before styling work obscures behavioral failures.

### 2. Keep two explicit core presentation subpaths

Keep a stable headless path and add a separately exported styled path:

```text
@emi/core/web                 headless contracts, actors, primitives with semantic/class hooks
@emi/core/web/styled          optional shadcn/Radix-based visual components and styles
```

These are capability boundaries inside the intentionally single `@emi/core` package. A
consumer may import the dependency directly, or `create-chat-app` may copy the same source
and tests into an owned workspace for shadcn-style customization; neither path should require
an `apps/chat` or HealthFit fork.

- Do **not** import `apps/chat` source from core or generic web.
- Re-home shared shadcn/Radix components and their dependencies deliberately into core's styled subpath (or an explicitly owned core style package), with licenses/dependency declarations and entry-isolation tests.
- Do not force consumers to take Tailwind or the styled bundle. Generic web should opt into the styled subpath; a future consumer can use headless primitives plus its own CSS.
- Preserve accessibility and keyboard semantics from the existing chat app's `Sidebar`, `Sheet`, buttons, inputs, selects, message layout, and message rail rather than duplicating them by hand.
- Preserve CSS variables/theme tokens and document the style import/required global CSS exactly once.

### 3. Extract generic presentational primitives

Move rendering from `apps/generic-web/src/app.tsx` into focused components under core. Start from the existing generic behavior; do not pull HealthFit copy or domain vocabulary into generic core.

- `ChatSidebar` / `ConversationList` / `MemoryPanel` / `SettingsPanel`
- `ChatHeader`
- `MessageViewport`, `MessageMinimap`, and scroll controls
- `FollowUpQueue`
- `ChatComposer` and attachments

Rules:

- Components receive explicit selected view data and named event callbacks; no fetching, storage, browser reads, `useState`, or actor construction in components.
- DOM refs/scroll handles stay in generic app (or a thin generic view adapter), never in an actor.
- Generic `App` should end as adapter construction, actor references/selectors, DOM refs, event wiring, and primitive composition. No large inline JSX surface.
- Do not reintroduce React state/effects for application, network, persistence, or UI state. `chatUiActor` owns searches, memory draft, and panel state; `settingsActor` and `browserStateActor` own persistence; session owns the composer draft.

### 4. Test generic web and worker as real fixtures

Add focused tests with no fake UI-only assertions where an actor or HTTP flow can be tested directly.

- Core `createActor` tests for new routing/primitive view contracts and the API-origin error path.
- Generic web component/browser tests: sidebar toggle/drawer, viewport containment, configuration validation, conversation loading error, send/stop/queue/force-send, branch opening, memories, settings hydration, offline draft restore.
- Generic worker request/integration tests: health, auth behavior, conversations, memories, threads, chat stream/reconnect, and structured error responses. Use a real Worker/D1-compatible local test harness where repository infrastructure permits.
- Add a Vite+worker smoke/E2E command used by generated-app acceptance. It must verify the actual local topology, not source-text route registration.
- Update `packages/create-chat-app` acceptance whenever canonical generic source, generated config, scripts, or required style imports move.

### 5. HealthFit migration only after protocol comparison

Inspect HealthFit's existing runtime (`apps/chat/app/chat/*`) and compare exact events, ownership, failure behavior, and fields before moving anything.

- Preserve HealthFit-only features: conversation view mode/sidebar width, markdown export, workout/sport tools, domain callbacks, and its richer runtime semantics.
- Extract only a matching generic protocol or a presentation primitive after proving equivalence with tests.
- Do not rename/move machines merely for visual similarity. Do not make core depend on `apps/chat`.
- Add regression tests before deleting any duplicated HealthFit source.

## Acceptance criteria

- Generic web looks and behaves like the existing app's shadcn/Radix design system, while consumers may still choose headless core primitives.
- No document/page scroll at desktop or mobile; sidebar and messages are intentional independent scroll regions.
- Sidebar is collapsible on desktop and a keyboard-accessible drawer on mobile.
- Generic web never attempts to parse Vite HTML as an API JSON response; local setup has a tested, documented API path.
- Generic web/worker have behavioral unit + integration/E2E coverage, including local worker/API smoke.
- `@emi/core/web` does not import Vite/browser globals/apps/HealthFit. Styled core code remains in a dedicated optional subpath.
- Parent actor context still does not mirror child snapshots; React has no app/domain/network/storage/UI `useState`.
- Every focused milestone is a separate JJ revision. Preserve unrelated work.
- Run focused checks while working and `pnpm release:check` once immediately before final handoff. Working copy must be clean.

## Working rules

- Use `rtk`, `ast-outline`, `apply_patch`, and `jj`.
- Follow `AGENTS.md`: TypeScript 7+, pnpm 11+, Vite 8.1+, Oxlint/Oxfmt; arrow functions; no unnecessary comments/casts; no manual Drizzle migration edits.
- Update `plans/core-chat-platform.md`, `plans/001-core-web-chat-runtime.md`, `plans/002-xstate-actor-architecture.md`, `improvements.md`, and generator acceptance as architecture/source ownership changes.
- Use focused package checks first. Do not finish until final release check passes.
