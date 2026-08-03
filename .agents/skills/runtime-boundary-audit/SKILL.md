---
name: runtime-boundary-audit
description: Audit and refactor reusable chat runtime boundaries across Effect, XState, React, browser, AI SDK, and Cloudflare code. Use when reviewing core extraction, React useEffect/useState/useRef ownership, dependency injection, adapter placement, provider lifecycle, or test coverage.
---

# Runtime boundary audit

## First pass

Read [`docs/architecture/core-boundaries.md`](../../../docs/architecture/core-boundaries.md),
[`docs/architecture/actor-ownership.md`](../../../docs/architecture/actor-ownership.md), and
[`docs/testing/runtime-test-matrix.md`](../../../docs/testing/runtime-test-matrix.md). Inspect `jj
status`, the nearby revisions, package exports, and existing anti-slop checks before editing.

Search broadly before fixing the reported example:

```text
rg "Effect\.fn|Context\.Tag|Context\.Service" packages apps
rg "use(State|Reducer|Ref|Effect|LayoutEffect)" packages apps
rg "from \"(ai|@ai-sdk|recharts|@cloudflare)" packages apps
```

## Ownership decisions

- Keep generic chat, browser, AI SDK, and Cloudflare adapters in `@emi/core` behind named
  subpaths. Keep HealthFit product workflows in a flavor or app package.
- Yield every Context.Service dependency inside an `Effect.gen` program. Provide its Layer at the
  outer adapter; never pass it through an `Effect.fn` argument object.
- Move durable domain, async, persistence, navigation-intent, and lifecycle state into actors.
  React subscribes and dispatches.
- Keep DOM refs, layout effects, observers, and imperative measurement in a thin React adapter
  when the browser element is the only owner of that capability. Put the policy in an actor.
- Use one routed path per operation, explicit completion/failure events, operation identity, and
  cancellation for replaceable work.

## Implementation loop

1. Name the owner, events, context, injected capabilities, and failure behavior.
2. Move the smallest complete state domain, then delete the duplicate React/app implementation.
3. Preserve the public facade and keep XState/Effect behind the intended subpath.
4. Add a real actor/provider test before broadening the refactor.
5. Run the focused test, typecheck, `pnpm slop:check`, and package coverage. Run the real Worker
   browser smoke when topology or browser adapters change.
6. Split the JJ work into focused described revisions.

## Review gates

Reject a change if it leaves generic code duplicated in an app, service dependencies in Effect
function inputs, domain lifecycle in React state/effects, stale async completion without identity,
or a new actor/provider without behavioral lifecycle coverage. Treat React Doctor dead-code reports
as evidence to classify: public exports and compile fixtures need documentation, not blind deletion.
