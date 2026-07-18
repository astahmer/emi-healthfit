# 001 — Keep chat runtime render-pure

- **Status**: TODO
- **Commit**: f163cac
- **Severity**: HIGH
- **Category**: Bugs & correctness
- **Rule**: react-doctor/no-ref-current-in-render
- **Estimated scope**: 1 implementation file, 1 focused test

## Problem

`apps/chat/app/chat/chat-runtime.tsx:147-148` mutates a ref while React is rendering:

```ts
const stateRef = useRef(state);
stateRef.current = state;
```

React may replay or discard renders. `stateRef` feeds stream submission, retry, and diagnostic callbacks, so an abandoned render can make a callback observe a state that was never committed.

## Target

Use the canonical fix: move the ref write to an effect. Keep the ref because callbacks intentionally need the latest committed XState snapshot without being recreated on every transition.

```ts
const stateRef = useRef(state);

useEffect(() => {
  stateRef.current = state;
}, [state]);
```

Do not replace the runtime with local React state; `chat-runtime-machine.ts` already owns its state machine.

## Steps

1. In `apps/chat/app/chat/chat-runtime.tsx`, replace the render-time assignment at line 148 with the effect above, immediately after the refs.
2. Add a focused provider test that starts a render, changes the XState snapshot, and verifies submit/retry sees only the committed snapshot. Extend `apps/chat/app/chat/chat-page.test.tsx` only if its existing harness can render `ChatRuntimeProvider`; otherwise create `apps/chat/app/chat/chat-runtime.test.tsx`.
3. Run `npx react-doctor@latest --scope apps/chat/app/chat/chat-runtime.tsx`; this diagnostic must clear without lowering the project score.

## Boundaries

- Keep `useRef` for abort controllers, cancellation, operation generation, and the latest committed actor snapshot.
- Do not add an XState context field merely to avoid this ref.
- Preserve streaming, retry, and resume behavior.

## Verification

- `pnpm --filter chat test --run apps/chat/app/chat/chat-runtime.test.tsx` (or the focused existing test).
- `pnpm --filter chat typecheck` and `pnpm --filter chat lint`.
- Manually submit, stop, revise, and retry an orphaned message; each must use the visible committed conversation state.
