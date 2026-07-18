# React audit — 2026-07-18

- **Commit audited**: `f163cac`
- **Evidence**: React Doctor 0.8.1, score **64** (`1` error, `27` warnings, `15` files)
- **Execution order**: 001 → 002 → 004 → 003 → Vite/TanStack Router migration.

## Vetted findings

| Severity | Location | Rule | Decision |
| --- | --- | --- | --- |
| HIGH | `app/chat/chat-runtime.tsx:148` | `no-ref-current-in-render` | Execute 001. Confirmed render-time mutation. |
| HIGH | `app/chat/chat-runtime.tsx:122` | `no-giant-component` | Execute 002. Hot streaming boundary. |
| HIGH | `components/chat/thread.tsx:646`, `gen-ui/registry.tsx:42`, `tool-result-content.tsx:134,272` | `no-array-index-as-key` | Execute 004. Protocol/UI identity issue. |
| MEDIUM | `app/chat/page.tsx:70` | `no-giant-component` | Execute 003 before route migration. |
| MEDIUM | `app/chat/session-sidebar.tsx:195,207`, `app/workouts/page.tsx:186` | accessibility/navigation | Fold into route/component cleanup; controls need semantic review. |
| MEDIUM | `app/data-export.tsx:16`, `app/workouts/page.tsx:37`, `components/chat/thread.tsx:477-478`, `session-sidebar.tsx:63` | locale format in render | Fix while moving to CSR Vite; share deterministic date formatters if server markup remains. |
| LOW | `app/chat/page.tsx:54,61`, `app/sessions.ts:87`, `components/chat/thread.tsx:286` | combine iterations | Optimize only while touching those paths; each list is small/cold except chat messages. |
| LOW | `app/usage-context.tsx:80` | hoist Intl | Hoist formatter in a small follow-up. |
| DEFER | `app/auth-boundary.tsx:16` | Next redirect | TanStack Router route guard replaces this, so do not add transient Next workaround. |
| DEFER | chart imports in `summary.tsx`, `tool-result-content.tsx` | dynamic import | Implement with `React.lazy`/Vite chunking during migration, not Next `dynamic`. |
| TEST ONLY | `components/chat/thread.test.tsx:121` | JSON clone | Replace when adjacent test changes. |
| ACCEPTED | `components/ui/button.tsx:62` | only-export-components | Deliberate component utility export; no runtime risk. |

## Hook audit

Every `useEffect`, `useMemo`, `useState`, `useCallback`, and `useRef` in `apps/chat/app` was reviewed. Keep means it has a concrete UI, browser-API, external-sync, stable-identity, or performance role; none should be replaced with XState merely for style.

| Area | Verdict |
| --- | --- |
| `action-feedback`, `upload`, `service-worker-reload` | Keep effects: timer cleanup, DOM input reset, and service-worker listener are external effects. |
| `auth-boundary` | Defer: effect redirect is a real flash risk; replace with a TanStack route guard in migration. |
| `auth/page`, `memory-panel`, `notes-panel`, `thread-navigation`, `data-import`, demos | Keep local `useState`: ephemeral form/demo state, not shared workflow state. |
| `chat-runtime` | Keep actor, abort/cancel/operation refs, transport/context memos, and callbacks; execute 001 for render purity and 002 for extraction. |
| `chat/page`, `use-conversation-machine`, `session-sidebar` | Keep XState/Query synchronization effects and ref; no duplicated domain state. Execute 003 for clearer ownership. |
| `data-export`, `privacy-controls` | Replace direct fetch effects with TanStack Query in a follow-up; both are server state and already have query conventions nearby. |
| `query-provider` | Keep lazy `useState(() => new QueryClient())`; it is the standard stable client lifecycle. |
| `theme-provider` | Keep effects/memo: localStorage, media-query subscription, DOM classes, and stable context value need them. |
| `usage-context`, `workouts/page` | Keep `useMemo`: it constructs context maps and derives searchable lists; hoist `Intl.NumberFormat`. |
| `summary` | Keep `days` state; it drives a query key. |
| `gen-ui/page` | Remove `mounted` state/effect during Vite client-only migration; it exists only for Next hydration. |

## Missed opportunities

- Migrate `DataExport` and `PrivacyControls` to TanStack Query/mutations; that removes duplicate cancellation and status plumbing.
- Keep the pending accessibility work paired with component extraction, then keyboard-test sidebar actions and expandable workout rows.
- Profile the chat message list before memoizing it. Stable keys and provider separation are higher leverage than premature `memo`.
