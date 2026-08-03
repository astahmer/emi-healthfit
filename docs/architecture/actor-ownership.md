# Actor ownership

React is the view layer. XState actors own state that survives a render, coordinates asynchronous
work, or represents a lifecycle transition. Effect owns typed server programs and service
composition. The React boundary subscribes, dispatches commands, and renders the current view.

## State placement

Put these in an actor or an actor-owned service:

- chat session, conversation, branch, composer, queue, settings synchronization, and attachment
  preparation state;
- request identity, cancellation, deadlines, retry, persistence, and stream completion/failure;
- navigation intent that must survive an async operation;
- feedback and error outcomes that are part of a domain transition; and
- derived state that coordinates more than one event or component.

Keep these in React only when they are view-local and disposable:

- controlled input values with no runtime meaning;
- a transient open/closed state that has no cross-event lifecycle; and
- DOM refs, layout effects, observers, and imperative measurements required to connect an actor
  policy to a browser element.

The last category is an adapter exception, not a second state machine. For example,
`use-thread-viewport-scroll` keeps the scroll container ref and `useLayoutEffect` because only the
browser can measure and scroll the element. The actor owns the policy (`initial position`,
`follow latest`, and `user interrupted`); React translates actor snapshots into DOM operations.

## Lifecycle shape

Use one explicit actor path for each operation:

```text
view event -> actor command -> invoked Effect/adapter -> typed completion or failure
     ^                                               |
     └────────────── actor snapshot/subscription ────┘
```

The parent coordinates child actors through commands and stable callbacks. It does not mirror child
snapshots in React state or reimplement a child transition with a second callback. Every replaceable
async operation carries an identity or cancellation policy and ignores stale outcomes.

## React review checklist

When reviewing a component, search for `useState`, `useReducer`, `useRef`, and `useEffect` and ask:

1. Does the value describe domain state, async status, persistence, navigation intent, or actor
   lifecycle? Move it to the owning actor.
2. Does the effect start, stop, retry, persist, subscribe, or broadcast runtime work? Make that an
   actor action/invocation and leave React with a subscription.
3. Is the ref only a DOM handle, observer handle, or layout measurement? It can remain in the
   React adapter, with the decision policy in an actor.
4. Is the value purely a local visual toggle or controlled field? React is acceptable.

Each actor needs a behavioral test that starts a real actor and asserts transitions, completion,
failure, stale-work handling, and disposal where applicable. Provider components need a direct test
for start, prop-driven synchronization, StrictMode-safe cleanup, and final disposal.
