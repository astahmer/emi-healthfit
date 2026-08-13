# Handoff: keep splitting reusable chat code into `@emi/core`

Use this as the opening prompt for the next agent. It is a continuation prompt: the codebase has
moved since these notes were written, so re-audit before editing and treat every file list as a
starting point, not a fact.

## Mission

Continue splitting and moving the useful, reusable blocks that still live in `apps/chat` into
`@emi/core`, following the boundaries and patterns already codified. Never regress existing
behavior, public entrypoints, or test coverage, and never absorb unrelated changes. Finish by
splitting the work into focused, described JJ revisions and running `pnpm check:handoff` once on
the final worktree. The full `pnpm release:check` gate runs in CI and is reserved locally for
deliberate full-release verification.

## Read first (they are the source of truth)

- `docs/architecture/core-boundaries.md` — what belongs in core vs flavor/app
- `docs/architecture/actor-ownership.md` — what belongs in actors vs React
- `docs/testing/runtime-test-matrix.md` — required test layers
- `docs/core-api.md` — curated public subpaths (the contract)
- `.agents/skills/runtime-boundary-audit/SKILL.md` — the audit loop and review gates
- `.agents/skills/xstate-actor-design/SKILL.md` — actor design procedure
- `scripts/check-architecture-boundaries.mjs`, `scripts/check-schema-effect-antislop.mjs`,
  `scripts/check-actor-test-pairs.mjs`, `scripts/check-oxlint-antislop.mjs`,
  `scripts/oxlint/emi-plugin.mjs`
- `jj status`, `jj log -r 'trunk()..@'`, package exports, `packages/core/source-manifest.json`

## Current state (2026-08-06 snapshot; re-verify)

Core already owns: chat-runtime actors (`packages/core/src/web/chat-runtime/*`), thread
viewport/scroll policy (`src/web/thread/thread-viewport-actor.ts`,
`src/web/thread/use-thread-viewport-scroll.ts`), the AI SDK/OpenAI adapter
(`src/adapters/ai-sdk/*`), Cloudflare route composition (`src/cloudflare/*`), browser
auth/webmcp/attachments, and generic chat views.

Still in `apps/chat` and candidates to triage (generic vs product):

- `app/chat/chat-runtime.tsx` + `app/chat/chat-runtime-context.ts` — provider lifecycle; React
  must be a thin subscriber/dispatcher, lifecycle belongs in actors
- `app/chat/conversation-machine.ts`, `app/chat/composer-config-machine.ts`,
  `app/chat/sidebar-item-machine.ts`, `app/chat/follow-up-queue.ts` — check whether any are
  generic chat state machines that should live behind a core facade
- `app/chat/thread-navigation.tsx`, `app/chat/session-sidebar.tsx`,
  `app/chat/orphan-turn-error.ts`, `app/chat/healthfit-chat-adapter.ts` — decide generic vs
  product with the boundary questions
- `components/chat/thread.tsx`, `components/chat/thread-composer.tsx`,
  `components/chat/thread-message-list.tsx` — view layer; if they duplicate core thread
  primitives, move/alias them and update generator fixtures
- `app/theme-provider.tsx`, `app/service-worker-updates.ts`, `app/service-worker-reload.tsx`,
  `app/action-feedback.tsx`, `app/usage-context.tsx`, `app/query-cache.ts`,
  `app/settings-store.ts`, `app/settings-sync-machine.ts`, `app/anonymous-auth.ts`,
  `app/auth-boundary.tsx`, `app/app-version.ts`, `app/release-history.ts`,
  `app/conversations.ts`, `app/sessions.ts`, `app/memories.ts`, `app/memory-panel.tsx`,
  `app/memory-events.ts`, `app/conversation-events.ts` — triage each with the boundary questions

Stays in app/flavor (do not move): Hevy integration, Discord controls, privacy controls, data
import/export product policy, notes product surfaces, HealthFit analytics/renderers/prompts/tools,
product pages/routes, and deployment/product auth policy.

## Rules from prior sessions (non-negotiable)

1. Full Effect DI. Every dependency is a `Context.Service`; effectful functions are
   `Effect.fn("...")` generators that `yield*` their deps. Never pass a service through an
   `Effect.fn` argument object; provide Layers at the outer adapter boundary. Use qualified
   `Schema.TaggedError` failures.
2. React is the view layer. Durable domain, async, persistence, navigation-intent, and lifecycle
   state live in XState actors behind facades. Components subscribe and dispatch; parents only
   coordinate. Give operations identity plus `AbortController` and explicit completion/failure
   events. `ChatRuntimeProvider` and any new provider must not accumulate `useEffect` logic.
3. DOM-only capabilities stay thin. Refs/layout effects/observers belong in a thin React adapter
   only when the browser element is the sole owner; the policy belongs in an actor (see
   `src/web/thread/thread-viewport-actor.ts`).
4. Adapters live in core. Browser, Cloudflare, and AI SDK implementations are core-owned, injected
   adapters behind named subpaths. Map platform types at the adapter edge; keep the protocol and
   server ports platform-neutral.
5. Preserve the public contract. Moving internal files must not break curated subpaths, entry
   isolation tests, packed-consumer tests, contract fixtures, `source-manifest.json`, or the
   create-chat-app owned-source hash fixture. Update the generator template/catalog when a
   dependency or copied source changes (`verify:chat-app` will catch drift).
6. Test before broadening. Add a real behavioral actor/provider test with each move; delete the
   app duplicate only after the core copy is covered. Keep coverage thresholds green: core and
   chat are 60% lines / 55% functions / 45% branches / 60% statements; generic-web is
   50/45/35/50.
7. Front-facing changes ship with e2e. Mock-mode Playwright plus real Worker mode
   (`test:e2e:worker`) where auth/persistence/tool/delete flows change; generic-web has its own
   mock plus generated acceptance. Add coverage; do not replace existing tests. The full CI release
   matrix runs these browser layers; run `pnpm check:e2e` locally when the change needs direct
   browser verification.
8. Deterministic tests only. Use stable UUID request ids, role-based selectors, and bounded retry
   only for legitimate transient conflicts (for example generation terminalization). Never click
   by loose text when a labeled control exists.
9. React Doctor is evidence, not gospel. Classify dead-code findings: public exports and compile
   fixtures may need documentation, not deletion.
10. JJ hygiene. One focused concern per revision with a concise description; no undescribed
    working-copy leftovers; squash with explicit paths and `--use-destination-message`; never
    absorb pre-existing unrelated changes.

## Suggested first pass

1. Re-run the audit searches (`rg "Effect\.fn|Context\.Tag"`, `rg "use(State|Effect|Ref)"`,
   imports of `ai`, `@ai-sdk`, `@cloudflare`, `alchemy` in `apps/chat`) and produce the current
   split list with a one-line owner verdict per file.
2. Pick the smallest complete domain (start with the provider lifecycle or one app machine), move
   it, test it, delete the duplicate, then widen.
3. Answer at the end, per domain: what moved, what stayed and why, what tests were added, and
   which remaining `useState/useEffect/useRef` are justified DOM adapters vs debt.

## Final gate

Run focused checks during work; immediately before handoff run `pnpm check:handoff` once on the
final worktree and report its exact result. For changes that affect generated apps or browser
behavior, report the targeted `check:generated`/`check:e2e` result when run; the full CI release
matrix remains responsible for generated acceptance and both Worker E2E modes. Report the final
revision list. Do not mark complete unless the handoff gate passes. If you hit friction, log it
(papercuts) and if you fix a recurring anti-pattern, encode a deterministic check in the anti-slop
scripts with tests.
