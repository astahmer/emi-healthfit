# Codebase improvement review

Reviewed 2026-07-15 after the chat, data portability, analytics, privacy, tooling, and sandbox work.
React Doctor 0.7.8 scanned 96 frontend source files and reported 22 diagnostics with a score of
65/100. Knip, both typechecks, 93 frontend tests, 32 API tests, formatting, and lint all pass; lint
still reports non-blocking warnings.

## Highest-leverage work

| Priority | Area                        | Evidence                                                                                                                                                                                                     | Improvement                                                                                                                                                                                          | Done when                                                                                                                         |
| -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| P0       | React correctness           | `apps/chat/app/chat/chat-runtime.tsx:142` mutates `stateRef.current` during render (`react-doctor/no-ref-current-in-render`). Concurrent React may replay or discard that render while the mutation escapes. | Move the ref synchronization into a commit-phase effect, or expose the XState actor snapshot to callbacks so render remains pure. Add a streaming/session-switch regression test before changing it. | React Doctor clears the error and rapid send/stop/session-switch behavior remains correct.                                        |
| P0       | Identity and data isolation | D1 personal-data rows have no owner id and the API routes are public.                                                                                                                                        | Execute `plans/auth.md`: better-auth, allowlisted Google sign-in, user-owned rows, protected-by-default routes, two-user isolation tests, and rate limits.                                           | A guessed conversation/data id cannot cross accounts and anonymous personal-data requests return `401`.                           |
| P1       | Accessibility               | `apps/chat/app/chat/session-sidebar.tsx:175` has an unlabeled rename input; `apps/chat/app/workouts/page.tsx:181` uses a clickable table row without keyboard semantics.                                     | Give the rename input a session-specific accessible label. Replace the row interaction with a real button in the first cell that controls an identified details row and exposes `aria-expanded`.     | Rename and workout expansion are fully operable with keyboard and announced correctly by a screen reader.                         |
| P1       | Bundle size                 | `apps/chat/app/summary.tsx:6` and `apps/chat/components/chat/tool-result-content.tsx:4` eagerly import Recharts. React Doctor flags both with `prefer-dynamic-import`.                                       | Split charts into client-only dynamically imported components. Keep text/table fallbacks in the initial route/chat bundle and show a stable chart skeleton while loading.                            | Initial chat bundle excludes Recharts; charts render without layout shift and error boundaries still isolate malformed tool data. |
| P1       | Runtime maintainability     | `ChatRuntimeProvider` is 348 lines (`apps/chat/app/chat/chat-runtime.tsx:117`) and combines transport, history reconciliation, stream lifecycle, attachments, revision, and public context construction.     | Extract cohesive hooks around persisted history, stream lifecycle, and attachment preparation. Keep the XState machine as the state authority and preserve the current `ChatRuntimeValue` boundary.  | Each effect has one lifecycle concern, focused tests cover extracted hooks, and React Doctor clears `no-giant-component`.         |

## Next tier

1. Split the 1,849-line `apps/api/src/api.worker.ts` into route modules (`chat`, `data`, `privacy`,
   `conversations`, `notes/memories`) while keeping one composition root and shared auth/CORS/error
   middleware. This becomes especially valuable before auth and Calendar add more routes.
2. Split `apps/api/src/db/operations.ts` by domain and later extract owner-scoped data access into a
   workspace package for the Discord worker. Keep transactions and error types close to each domain.
3. Replace repeated frontend `fetch`/`response.json()` handling with one schema-decoding API client.
   It should inspect status/content type before parsing so an HTML proxy error becomes an actionable
   message rather than `Unexpected token` or an invalid-JSON exception.
4. Fix unstable list identity in `components/chat/gen-ui/registry.tsx:42` and
   `components/chat/tool-result-content.tsx:134,272`. Extend normalized generative-UI elements and
   table/citation DTOs with stable ids rather than using array indexes.
5. Hoist date/number formatters and use the app timezone deliberately. React Doctor found six
   locale-format calls during render plus a repeatedly constructed `Intl.NumberFormat` in
   `app/usage-context.tsx:80`.
6. Lazy-load the six threading demos from their sandbox route so prototype-only UI never enters the
   production chat dependency graph. Keep real-chat integration gated by the evaluation criteria in
   `plans/chat-threading-followups.md`.
7. Add a small performance/e2e suite for rapid sidebar switching, new-chat isolation, generation
   resume/stop, attachment paste, and branch creation. These are concurrency-sensitive paths where
   unit tests alone can miss browser timing problems.
8. Move model pricing out of hardcoded presentation data into versioned provider metadata with a
   “last verified” date. Preserve the current estimate disclaimer and add cached-token/tool-fee
   accounting when provider usage exposes it.

## Quality backlog from automated scans

- Replace mutating `sort()`/`reverse()` calls with `toSorted()`/`toReversed()` where behavior is
  intended to be immutable.
- Hoist pure helpers currently recreated inside functions (`pad`, `average`, stream test helpers).
- Move ReactMarkdown component renderers out of `MarkdownText`; Oxlint reports nested component
  definitions that are rebuilt for every assistant message render.
- Stabilize array/object props on hot chart and tool-result paths only after measuring with React
  DevTools Profiler. Do not blanket-memoize cold Settings or sandbox components.
- Parallelize independent asset-copy operations in `apps/chat/scripts/copy-assets.mjs`.
- Decide whether generated shadcn component modules are treated as a preserved local library or are
  pruned aggressively. Knip currently ignores unused exports in those six modules while still
  checking the rest of the application.

## Product and platform opportunities

- Execute the consent-first Google Calendar plan after auth ownership lands.
- Execute the Discord plan only after auth; keep MVP read-only and responses ephemeral.
- Add content-security policy, origin/CSRF enforcement, user-scoped rate limiting, and upload magic-
  byte validation as part of the auth/security pass.
- Add observability around generation recovery, provider latency, tool latency, R2 retention cleanup,
  and import/export counts using `Effect.log*` and spans with secrets/redacted health content omitted.

## Explicitly deferred

The following `ideas.md` items still require a product decision before implementation: scheduled
ingestion, queued PWA sends, richer progress explanations, and further generation lease/cancel
semantics. They should not be inferred from this audit.
