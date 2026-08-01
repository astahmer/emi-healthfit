---
name: xstate-actor-design
description: Design and refactor frontend application state with XState machines and actors. Use when deciding whether state, async work, persistence, subscriptions, or UI behavior belongs in React, a machine, or a composed actor.
---

# XState Actor Design

## Decide ownership

Use React only for rendering, event wiring, and imperative DOM refs.

Use a machine for durable state with legal transitions: workflow phase, session/chat state, queues, selected entity, recoverable errors, and reset semantics.

Use an actor for external or concurrent behavior: HTTP/stream work, cancellation, retries, storage, browser subscriptions, timers, or a reusable child state domain.

Keep pure derived values as selectors, not duplicated context. Keep DOM elements, scroll positions, and transient layout measurement in refs.

## Choose a shape

- Use a single machine when transitions and invariants belong together.
- Use composed children when domains have separate lifetimes, failure modes, or update frequency.
- Let the parent route typed events and own child references. Never copy child snapshots into parent context.
- Inject fetch, storage, clock, ID generation, and browser subscriptions. Core actors must not read framework configuration or browser globals.
- Prefer `fromPromise` for one result; use `fromCallback` for streams, subscriptions, cancellation, or multiple events.

## Implement

1. Write event and context ownership before moving code.
2. Preserve protocol events at boundaries; give child-to-parent events explicit names.
3. Model cancellation with operation identity plus `AbortController`; discard stale completion/chunk events.
4. Make error and retry transitions explicit. Do not leave async work in React effects or handlers.
5. Expose actor refs and selectors; components use `useSelector`, not mirrored `useState`.
6. Keep adapters injectable and test them at their real boundary.

## Test

Use `createActor` tests for legal transitions, cancellation, stale work, rejection, parent routing, and child isolation. Test persistence and browser adapters with concrete in-memory or browser-like adapters. Add browser coverage only for rendered behavior and accessibility.

## Avoid

- Actors for pure rendering or one-off DOM commands.
- Parent context copies of child state.
- `useState` for application, domain, network, storage, or subscription state.
- Global browser/Vite imports in reusable core actors.
- Merging app-specific machines merely because names look similar; extract shared protocol only after events, ownership, and failure semantics match.
