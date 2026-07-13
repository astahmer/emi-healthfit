# Other improvements — implementation plan

## Scope

Implement every item under **4. Other improvements to consider** in `next_features_plan.md`:

1. Mobile layout
2. Cost tracking
3. Better tool result rendering
4. Error boundaries
5. Light/dark toggle
6. Input file attachments
7. Caching
8. Rate limiting / max messages

---

## 1. Mobile layout

**Goal:** make the session sidebar usable on small screens.

- `SessionSidebar` becomes collapsible on mobile.
- Default state: hidden on `md` and below, visible on `md` and up.
- Add a hamburger toggle in the chat header (next to the model/coach/web-search bar).
- When open on mobile, render the sidebar as a full-width overlay with a close button and backdrop.
- Keep the existing desktop behavior (fixed 16rem width, always visible).

**Files:**
- `apps/chat/app/chat/session-sidebar.tsx`
- `apps/chat/app/chat/page.tsx`

---

## 2. Cost tracking

**Goal:** persist and display token usage per assistant message.

- Add token columns to `messages`:
  - `prompt_tokens INTEGER`
  - `completion_tokens INTEGER`
  - `total_tokens INTEGER`
- Update `saveThreadMessages` in `apps/api/src/db/operations.ts` to accept an optional `usage` object per message.
- Update `createChatStream` callback in `apps/api/src/chat/ai-sdk.ts` so `onFinish` receives the full event, including `usage`.
- In `handleAiSdkChat`, capture `usage` and pass it when saving the assistant message.
- Update `getThreadMessages` to return usage fields.
- Update the frontend `ThreadWithMessages` type and expose usage via a small context.
- Display:
  - a tiny token badge on each assistant message footer,
  - a running total for the current thread in the chat header.

**Files:**
- `apps/api/migrations/0003_usage_and_limits.sql`
- `apps/api/src/db/operations.ts`
- `apps/api/src/db/schema.ts` (types)
- `apps/api/src/chat/ai-sdk.ts`
- `apps/api/src/api.worker.ts`
- `apps/chat/app/sessions.ts`
- `apps/chat/app/chat/page.tsx`
- `apps/chat/components/assistant-ui/thread.tsx`
- new: `apps/chat/app/usage-context.tsx`

---

## 3. Better tool result rendering

**Goal:** stop showing raw JSON for common tool results.

- Replace the generic `ToolFallbackResult` with a `ToolResultContent` dispatcher.
- Detect the tool name and parse the result string when needed.
- Rich renderers:
  - `get_workout_history` → table with date, title, volume, exercises, sets.
  - `get_exercise_progress` → table of workouts + PR summary card.
  - `get_recovery` → card layout with recovery label, explanation, sleep average, last workout, recent volume.
  - `web_search` → citation list when the result contains `results` / `sources` / `citations` with `title`/`url`.
- Fall back to the current preformatted JSON for everything else.

**Files:**
- `apps/chat/components/assistant-ui/tool-fallback.tsx`
- new: `apps/chat/components/assistant-ui/tool-result-content.tsx`

---

## 4. Error boundaries

**Goal:** recover gracefully from streaming and network errors in the chat UI.

- Add a reusable `ErrorBoundary` class component in `apps/chat/components/error-boundary.tsx`.
- Wrap the runtime + thread area in `ChatPageInner` with the boundary.
- On error, show a friendly fallback with the error message and actions: **Reload page**, **Start new chat**.
- Improve the existing thread load error state with a **Retry** button.

**Files:**
- new: `apps/chat/components/error-boundary.tsx`
- `apps/chat/app/chat/page.tsx`

---

## 5. Light/dark toggle

**Goal:** let users switch between light and dark themes.

- Remove the hardcoded `className="dark"` from `<html>` in `layout.tsx`.
- Create a client `ThemeProvider` that:
  - reads a saved preference from `localStorage`,
  - falls back to `prefers-color-scheme`,
  - toggles the `dark` class on `document.documentElement`.
- Add a `ThemeToggle` button in `NavHeader` (sun/moon icons).
- Persist the choice in `localStorage` under `emi-theme`.

**Files:**
- `apps/chat/app/layout.tsx`
- `apps/chat/app/nav-header.tsx`
- new: `apps/chat/app/theme-provider.tsx`
- new: `apps/chat/app/theme-toggle.tsx`

---

## 6. Input file attachments

**Goal:** allow images/documents to be attached to a message.

- Assistant-ui already provides attachment primitives and `vercelAttachmentAdapter`.
- Explicitly wire `adapters: { attachments: vercelAttachmentAdapter }` into `useChatRuntime`.
- Backend already accepts unknown message parts and `convertToModelMessages` handles file/image parts.
- Add a guard: reject individual attachments over 5 MB and messages with more than 10 attachments.

**Files:**
- `apps/chat/app/providers.tsx`
- `apps/api/src/api.worker.ts` (size/count guard)

---

## 7. Caching

**Goal:** avoid repeated DB calls for expensive read-only endpoints.

- Add a small in-memory TTL cache helper in the API worker (`apps/api/src/cache.ts`).
- Cache:
  - `GET /api/summary` → 5 minutes.
  - `GET /api/recovery` → 2 minutes.
- The cache lives in the worker process. It is not shared across instances, but it removes duplicate calls within the same instance.

**Files:**
- new: `apps/api/src/cache.ts`
- `apps/api/src/api.worker.ts`

---

## 8. Rate limiting / max messages

**Goal:** protect the worker from abuse.

- Add a per-IP sliding-window rate limiter in the worker (`apps/api/src/rate-limit.ts`).
- Apply limits:
  - `POST /api/chat` — 30 requests per minute.
  - `POST /api/suggestions` — 30 requests per minute.
- In `handleAiSdkChat`, reject requests when `existingMessages.length + incomingMessages.length > 200`.
- Return `429 Too Many Requests` with a clear message when limits are hit.

**Files:**
- new: `apps/api/src/rate-limit.ts`
- `apps/api/src/api.worker.ts`

---

## Acceptance criteria

- Sidebar collapses cleanly on mobile and stays open on desktop.
- Token usage appears after the assistant finishes a response.
- Workout, recovery, and web-search tool calls render rich UI instead of raw JSON.
- A thrown runtime error shows the boundary fallback instead of a blank screen.
- Theme toggles between light and dark and persists across reloads.
- Images/docs can be attached and are sent with the message.
- Repeated calls to `/api/summary` and `/api/recovery` hit the cache within the TTL.
- Rapid calls to `/api/chat` or `/api/suggestions` are rate-limited.

## Verification

Run the standard checks before finishing:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm fmt
```
