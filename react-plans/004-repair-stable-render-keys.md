# 004 — Give generated UI and streamed messages stable identities

- **Status**: DONE (2026-07-19)
- **Commit**: f163cac
- **Severity**: HIGH
- **Category**: Bugs & correctness
- **Rule**: react-doctor/no-array-index-as-key
- **Estimated scope**: 4 implementation files, component tests

## Problem

React Doctor found index-based keys in generated UI and chat rendering:

```tsx
// apps/chat/components/chat/gen-ui/registry.tsx:42
key={`set-${index}-${set.exercise}-${set.weightKg ?? ""}`}

// apps/chat/components/chat/thread.tsx:646
key={message.id === "" ? `${message.role}-${index}` : message.id}
```

`thread.tsx:409` plus `tool-result-content.tsx:134` and `:272` have the same issue for generated rows/cells. Reordering or streaming insertion can preserve the wrong component state or target the wrong user action.

## Target

Use the canonical rule fix: use a stable item id. A position is not an identity.

- Extend generated `SetList` payload rows with a stable `id` derived by the tool from immutable domain values (`sessionId`, `exercise`, `setIndex`), then use `key={set.id}`.
- Give every `UIMessage` a UUID at creation/normalization. `Thread` must use `key={message.id}` with no index fallback; malformed empty IDs are rejected at the protocol boundary instead of rendered ambiguously.
- Make table render data carry `row.id` and cell column keys. If a table is truly static, use stable header names rather than indexes.

## Steps

1. Trace each list item to its producer before editing the JSX. Update the tool schema and generated UI contract together.
2. In `apps/chat/components/chat/thread.tsx`, remove the index fallback only after all local, cached, and streamed message constructors guarantee an ID.
3. Update `apps/chat/components/chat/gen-ui/registry.tsx` and `tool-result-content.tsx` to consume stable row/set IDs.
4. Add reordering tests that edit one row/message, insert/reorder a sibling, and verify state stays with its original domain item.

## Boundaries

- Do not synthesize UUIDs inside `map`; that remounts every render.
- Keep streamed assistant message identity stable across chunks.
- Do not change the visible generated UI schema without versioning its producer and consumer together.

## Verification

- `npx react-doctor@latest --scope apps/chat/components/chat` clears all targeted key diagnostics.
- `pnpm --filter chat test --run apps/chat/components/chat/thread.test.tsx`.
- Exercise a streamed assistant response, attachments, generated set list, and a reordered table in the browser.
