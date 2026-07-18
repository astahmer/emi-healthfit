# 003 — Split page layout from chat route coordination

- **Status**: TODO
- **Commit**: f163cac
- **Severity**: MEDIUM
- **Category**: Maintainability & architecture
- **Rule**: react-doctor/no-giant-component
- **Estimated scope**: 3–5 implementation files, existing page tests

## Problem

`apps/chat/app/chat/page.tsx:70-436` mixes route parsing, XState coordination, React Query cache mutation, chat header controls, provider construction, thread navigation, and error overlays. It is 360 lines and will otherwise make the Vite/TanStack Router migration harder than needed.

## Target

Follow the canonical rule fix: pull view sections into components, leaving the route coordinator to derive data and dispatch events. Create:

- `chat-page-header.tsx` for rename, copy/export, compact, and new-chat controls.
- `chat-page-content.tsx` for `Thread`, OpenAI-key gate, and loading/error overlays.
- `chat-page-route.tsx` for conversation-machine, composer-machine, search settings, and provider wiring.

The route coordinator must pass data and callbacks down; it must not create a duplicate local conversation state. Move `sessionIdFromPath` and Next navigation replacements only as part of the Vite plan, not this refactor.

## Steps

1. Extract the header JSX and its narrow prop contract from `apps/chat/app/chat/page.tsx:180-330`.
2. Extract the main content/overlay JSX from lines 331-428.
3. Keep the two cache/branch effects in the coordinator: both synchronize external React Query/XState state and are not candidates for removal.
4. Preserve existing direct-load, new-chat, branch, compact, copy, and API-key tests in `apps/chat/app/chat/chat-page.test.tsx`.

## Boundaries

- Do not replace XState with `useState`.
- Do not move pathname parsing or `next/navigation` in this revision.
- Preserve browser-history `replaceState` behavior until TanStack Router owns it.

## Verification

- `npx react-doctor@latest --scope apps/chat/app/chat/page.tsx` clears the giant-component diagnostic.
- `pnpm --filter chat test --run apps/chat/app/chat/chat-page.test.tsx`.
- Manually load `/chat/:id`, create a new chat, rename a title, compact a conversation, and switch a branch.
