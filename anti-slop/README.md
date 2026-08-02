# Anti-slop checks

The anti-slop directory contains repository-specific rules that keep the clean-slate
architecture mechanically visible. It is intentionally separate from `.antislop.jsonl`:

- `.antislop.jsonl` records the decision and the preferred correction for humans and agents.
- `anti-slop/rules/` contains executable ast-grep rules for syntax patterns.
- `anti-slop/tests/` contains small valid/invalid examples for each executable rule.
- `scripts/check-architecture-boundaries.mjs` checks repository topology and import boundaries
  that are clearer and safer to express with filesystem-aware code than AST matching.

Run the checks with:

```bash
pnpm slop:check
pnpm slop:test
```

## Rules

The current checks protect these boundaries:

- generic core stays free of product, provider, and platform leakage;
- compatibility aliases and migration packages do not re-enter the source tree;
- `index.ts` is not an internal implementation or import target;
- public boundaries use explicit `.export.ts` files and do not use export-from barrels;
- internal modules import named implementation files, never another `.export.ts` boundary;
- internal classes do not forward static domain members; only a named public `.export.ts` facade may group an owning domain;
- domain APIs group related operations behind an instantiated class or a static domain class;
- generic core does not use abstract domain classes or empty private constructors; dependency contracts
  use Effect `Context.Service` and `Layer`;
- Effect server services are composed with `Context.Service` and `Layer`, not dependency-bearing constructors;
- Effect is the canonical implementation surface: Promise helpers are thin outer adapters over typed
  Effect success and error channels;
- generic server ports/use cases must not flatten Effect programs with `runPromise`/`runSync`;
- actor-owned runtime state must not be duplicated with `useState` or `useReducer`;
- generic protocol and server contracts do not import raw database, Cloudflare, or AI SDK types;
- persistence code maps rows explicitly and stays behind ports/adapters;
- raw SQL domains may exist only as advanced adapter implementations; generic handlers consume
  granular Effect services supplied through `Layer`;
- each advanced database domain keeps low-level query functions private and exposes one named
  `Context.Service` with a `Layer`; the layer yields the implementation once, and callers yield
  that service once instead of rebuilding or re-providing it per operation;
- fallible database queries use `QueryDatabase.tryPromise` or a tagged `Effect.tryPromise`; generic
  database clients never erase query failures with `Effect.promise` or a `never` error channel;
- external JSON, URLs, HTTP input, tagged errors, and schemas use the established typed policies;
- `Stream.fromReadableStream` and `Stream.fromAsyncIterable` map external causes into tagged
  domain errors instead of returning the raw `unknown` cause;
- generic chat rendering, scrolling, and runtime state belong in `@emi/core`, while products supply
  only product renderers, extensions, and configuration.

## Deterministic boundary checks

`check-architecture-boundaries.mjs` owns checks that need package metadata, filesystem topology, or
cross-file context:

| Check                   | Violation caught                                                                   | Required shape                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Public domain surface   | A new non-exception public entrypoint grows into a flat utility barrel             | One named domain class or owned instance; keep helpers private                  |
| Public web/XState split | The common web entry imports or exposes an actor/machine                           | Put raw actor access in `@emi/core/advanced/xstate`                             |
| Injected capabilities   | Runtime or use-case code reads ambient time, randomness, fetch, or browser globals | Receive capabilities through runtime options, services, or layers               |
| Effect-first domain     | A generic port/use case calls `Effect.runPromise` or `Effect.runSync` internally   | Return the typed `Effect`/`Stream`; run it only at the HTTP/platform edge       |
| Actor-owned state       | Runtime implementation duplicates actor state with React `useState`/`useReducer`   | Read actor-owned snapshots through the runtime subscription facade              |
| Package self-boundary   | A consumer reaches into `@emi/core/src` or `@emi/core/dist`                        | Import a declared package subpath                                               |
| Export topology         | An implementation imports a boundary, wildcard, forwarding module, or `index.ts`   | Import the owning implementation and bind explicit exports only at `.export.ts` |

The grouping check deliberately allows the independently consumable React view/recipe entries,
HTTP contract items, and explicit advanced XState entrypoint. Those exceptions are contract-shaped,
not permission to add miscellaneous helpers to a public file. The checked-in `anti-slop/rules/`
and `anti-slop/tests/` fixtures cover syntax-local cases; this script covers the repository-wide
cases that ast-grep cannot safely infer.

The grouping rule has deliberate exceptions: independently consumable React view primitives, schema
types, and a package `.export.ts` boundary may expose several named bindings when each binding is a
separately discoverable contract item. Internal helpers should remain private to their owning domain.

The Effect-first rule means a use case or adapter should first expose an `Effect` or `Stream` with
qualified success and error types. A Promise-returning method is allowed only at a browser, HTTP, or
other platform edge, and should be implemented by running the canonical Effect program rather than
duplicating its logic. A service implementation should use `Layer.effect` or `Layer.succeed` and
return an object whose methods are already Effect programs. Do not capture an Effect context and
re-provide it inside a method, create local `provideDatabase` helpers, or use `Effect.flatMap` as a
static operation facade. Use `Effect.catch` or `Effect.catchTag` for tagged failures; reserve
`Effect.catchIf` for genuine predicates. Pure synchronous transformations may stay synchronous
when they have no environment or fallible boundary; wrapping them in Effect solely for appearance
is also slop.

Database-specific rule: `Effect.promise` is not a database error boundary. Kysely, D1, and other
fallible query calls must pass through `QueryDatabase.tryPromise` (or an equivalent tagged
`Effect.tryPromise`) so the failure remains visible in the Effect error channel. A higher-level
port may map `DatabaseQueryError` to its own domain error, but it must not erase the failure as
`never`.

## Oxlint contextual rules

`scripts/oxlint/emi-plugin.mjs` complements ast-grep with ESLint-compatible rules that need source
context. It rejects abstract core domain classes, empty private constructors, export forwarding,
raw provider/platform imports in generic protocol and server contracts, `Effect.run*` inside
generic domain code, context capture/re-provision, predicate-based handling of tagged errors,
static service-operation facades, fallible database `Effect.promise` calls, and identity `onError` callbacks passed to
`Stream.fromReadableStream`. The checked-in fixtures under `anti-slop/tests/oxlint/` exercise the
plugin; `pnpm slop:check` runs both the fixture checks and a clean generic-core scan.
Filesystem-aware boundary checks additionally reject legacy source paths, internal `index.ts`
modules, raw SQL imports in generic handlers, and constructor-based server/adapter dependency
injection.

When a new smell is found, add its human rule with `antislop add`, then add the smallest
deterministic rule or boundary assertion that can prevent recurrence. Every executable rule must
have at least one valid and one invalid fixture.

Rules are deliberately narrow. A rule should reject a known correctness or architecture failure,
not encode personal formatting preferences that belong in Oxfmt or Oxlint.
