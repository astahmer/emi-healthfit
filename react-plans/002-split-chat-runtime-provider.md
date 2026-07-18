# 002 — Split chat runtime orchestration by responsibility

- **Status**: TODO
- **Commit**: f163cac
- **Severity**: HIGH
- **Category**: Maintainability & architecture
- **Rule**: react-doctor/no-giant-component
- **Estimated scope**: 4–6 implementation files, focused runtime tests

## Problem

`apps/chat/app/chat/chat-runtime.tsx:122-526` is a 400-line provider that owns transport creation, resume synchronization, stream lifecycle, attachment preparation, diagnostics, and context projection. The component is difficult to change safely; the render-purity error in plan 001 is one consequence.

## Target

Follow the canonical rule fix: pull coherent sections into components/hooks while keeping `ChatRuntimeProvider` as the composition boundary. The target module boundaries are:

| Module | Owns |
| --- | --- |
| `chat-transport.ts` | `DefaultChatTransport`, orphan-turn response handling, diagnostic event emission |
| `use-chat-history-sync.ts` | history signature, abort-on-route-change, persisted history refresh and resume |
| `use-chat-submission.ts` | submit, revise, retry, stop, stream consumption, operation guard |
| `chat-runtime-context.ts` | public `ChatRuntimeValue`, context, and `useChatRuntime` |
| `chat-runtime.tsx` | actor setup, attachment-only UI state, hook composition, memoized provider value |

All hooks receive one object parameter. `chat-runtime-machine.ts` remains the single state owner; no effects copy machine context into independent React state.

## Steps

1. First apply plan 001 so every extracted callback reads a committed actor snapshot.
2. Extract transport and diagnostic-event code from `apps/chat/app/chat/chat-runtime.tsx:150-203`. Preserve headers, request body, abort signal, and diagnostic event types exactly.
3. Extract route/history synchronization from lines 204-294 into `use-chat-history-sync.ts`. Its cleanup must keep `operationRef`, abort the current request, cancel the stream, and dispatch `history.changed` exactly once per changed history signature.
4. Extract submission, revision, orphan retry, and stop from lines 296-481 into `use-chat-submission.ts`. Keep `operationRef` monotonic and preserve `stateRef` reads.
5. Move `ChatRuntimeContext` and `ChatRuntimeValue` to `chat-runtime-context.ts`, update consumers, and retain a memoized provider value.
6. Add focused tests for route history replacement during a stream, resume after refresh, attachment-only submission, revision, and orphan retry. Keep existing chat E2E coverage passing.

## Boundaries

- No public provider prop or consumer API changes.
- Do not parallelize streamed chunks; ordering is protocol-significant.
- Do not introduce another state machine: XState already models runtime transitions.
- Do not combine this refactor with the Vite migration.

## Verification

- `npx react-doctor@latest --scope apps/chat/app/chat` clears the giant-component finding for the provider and preserves score.
- Run focused runtime tests plus `pnpm --filter chat test:e2e`.
- Confirm a stream continues, can be stopped, and resumes after reload with no duplicate user message.
