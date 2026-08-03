# @emi/core maintainability audit

Date: 2026-08-03

## Executive assessment

The codebase is in substantially better shape than the extracted application it came from. The
important architectural decisions are now visible in the source tree and backed by tests:

- XState owns browser and chat actor state; React is a view and command surface.
- Effect owns server programs, typed failures, service requirements, layers, and incremental
  streams.
- Protocol, domain, persistence, provider, and platform values have named boundaries.
- Public package exports are curated through explicit `.export.ts` files.
- Generic-web is a real consumer of the public runtime rather than a source-layout demo.
- Anti-slop checks catch many of the failure modes that created the earlier extraction mess.

I would keep that direction. I would not do another broad rewrite.

I am not yet satisfied with the codebase as a finished platform, though. The remaining problems are
mostly consolidation problems: some advanced boundaries still contain provider-shaped values,
some domains are too large to reason about locally, and the repository currently has two server
composition models. Those are solvable, but several require an explicit architectural decision.

## Safe improvements made during this audit

The earlier core API documentation referred to the removed `packages/core/src/chat/openai.ts`. The
implementation is now under `packages/core/src/adapters/ai-sdk/openai-chat.ts`; the current API
contract lives in `docs/core-api.md` so future agents do not follow a dead path. This report remains
in the plans index because its maintainability follow-ups are not complete.

The unused `ChatServerConfiguration.extensions` field was removed from the server configuration
contract. Extensions remain available through the explicit extension composition surface until
server prompt/tool composition has a real owner.

## What is strong and should stay

### Public API organization

The root API is intentionally tiny, and the capability subpaths are discoverable. The grouped
domains in `packages/core/src/chat.export.ts`, `packages/core/src/server-database.export.ts`,
`packages/core/src/cloudflare.export.ts`, and `packages/core/src/web.export.ts` are substantially
better than a flat utility barrel. The `.export.ts` naming rule makes package boundaries visible.

The exception for individually consumable React primitives is justified. I would not force those
components into a class merely to satisfy a stylistic rule.

### Effect usage in generic core

The generic core now uses `Context.Service` and `Layer` for dependency-bearing services, tagged
errors for fallible boundaries, `Effect.fn` for named programs, and `Stream` for replay and
incremental work. `QueryDatabase.tryPromise` correctly prevents database failures from becoming
an accidental `never` channel.

The remaining `Effect.runPromise` calls in core are mostly named Promise/platform facades or
provider adapters. That is the right general shape. Pure transformations remain synchronous
instead of being wrapped in Effect for appearance.

### Actor ownership

The runtime facade is a good boundary. The generic app does not reach into child snapshots, and
the actor graph remains the owner of transport, persistence, browser, and UI lifecycle state.
The tests around cancellation, stale work, persistence ordering, and public exports are valuable
regression assets.

### Deterministic guardrails

The anti-slop system is unusually useful now: human rules, ast-grep fixtures, contextual Oxlint
rules, and filesystem-aware boundary checks cover different classes of mistakes. The separation
between quick syntax checks and cross-file/package checks is the correct model.

## Highest-value findings

| Priority | Finding                                                                              | Evidence                                                                                                                                                                                                                     | Recommendation                                                                                                                                                                                                                                                              | Confidence                                 |
| -------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| P0       | Provider-shaped chat operations are still exposed through `@emi/core/chat`.          | `packages/core/src/chat.export.ts` imports and groups `OpenAiChat`; `packages/core/src/chat/ui-messages.ts` imports AI SDK `UIMessage` types.                                                                                | Decide whether `@emi/core/chat` is intentionally an explicit provider-bound capability or whether all provider operations move to `@emi/core/adapters/ai-sdk`. My recommendation is the latter, leaving `Chat` for provider-neutral operations only.                        | Architecture decision needed               |
| P0       | The advanced database subpath persists and replays AI SDK `UIMessageChunk` values.   | `packages/core/src/server/db/generations.ts`, `packages/core/src/server/generation-replay.ts`, and `packages/core/src/server/decode-ui-message-chunk.ts`.                                                                    | Long term, persist a provider-neutral `GenerationEvent`/JSON DTO and perform AI SDK chunk decoding/encoding only in the adapter or app edge. This is a data-format decision and may require a migration, so I did not change it blindly.                                    | Architecture and migration decision needed |
| P0       | There are two server composition models.                                             | `packages/core/src/server/use-cases/chat-server.ts` provides the generic `ChatServerLive`, while `apps/api/src/core/routes/chat-generation-lifecycle.ts` and its neighboring route modules contain the production lifecycle. | Choose one canonical server model. Prefer making `apps/api` compose the generic core services and keep product routes as thin flavor composition. Otherwise explicitly label `ChatServerLive` as a reference/generic starter and stop implying it is the production server. | Architecture decision needed               |
| P1       | Persistence domains are too large despite granular ports.                            | `packages/core/src/server/db/conversations.ts` is 1,116 lines; `generations.ts` is 775; `memories.ts` is 471.                                                                                                                | Split implementation files by domain capability—conversation, message, thread, suggestion, generation lifecycle—while retaining one composite adapter where that is useful. Keep the current granular ports; do not create one mock for the entire database.                | Strong recommendation                      |
| P1       | HealthFit persistence still uses Promise-first database composition.                 | `packages/flavor-healthfit/src/db/fitness.ts` is 1,121 lines and contains dozens of `Effect.promise` calls; `hevy-store.ts`, `ingested-data.ts`, and chat context have the same pattern.                                     | Migrate product persistence to tagged errors, `QueryDatabase.tryPromise`-style boundaries, `Context.Service`, and `Layer`. Split `fitness.ts` before migrating so the error channels stay understandable.                                                                   | Strong recommendation, large scope         |
| P1       | Core API route code still has raw Promise boundaries.                                | `apps/api/src/core/routes/chat-generation-lifecycle.ts`, `chat-history.ts`, `http/conversations.ts`, and `diagnostics/bundle.ts` contain `Effect.promise` calls.                                                             | Replace each with a named typed boundary—usually `Effect.tryPromise` plus a domain error—and map errors once at the HTTP edge. Do not create a generic `decode` wrapper that hides the error channel.                                                                       | Strong recommendation                      |
| P1       | `ChatServerConfiguration.extensions` was declared but never consumed.                | `packages/core/src/server/ports/chat-server.ts` defined the field; the live server only yielded model/configuration and never read extensions.                                                                               | Removed in `refactor(core): remove unused server extension configuration`; extensions remain available through the explicit extension composition surface until server prompt/tool composition has a real owner.                              | Resolved                                   |
| P1       | Layer composition is repeated in request store factories.                            | `packages/core/src/server/make-conversation-store.ts`, `make-generation-store.ts`, and `make-memory-store.ts` each construct a database layer and provide it to a store layer.                                               | First decide whether these are intentionally request-scoped. If not, compose a long-lived database `ManagedRuntime`/worker layer once and provide only request-specific identity at the edge. Do not introduce local `provideDatabase` helpers.                             | Runtime-lifecycle decision needed          |
| P2       | `ServerDatabase` is an effective advanced registry but exposes a very broad surface. | `packages/core/src/server-database.export.ts` groups tables, schemas, database services, stores, replay, and errors.                                                                                                         | Keep it for the current advanced boundary, but consider separate `server/database-schema` and `server/database-services` subpaths if consumers begin importing unrelated concerns. Do not split merely for file count.                                                      | Monitor first                              |
| P2       | Generic UI ownership is improved but the main app still has large wrappers.          | `apps/chat/components/chat/thread.tsx` is 763 lines; `apps/chat/app/chat/conversation-machine.ts` is 635; generic core owns many of the underlying primitives already.                                                       | Keep product-specific wrappers for memory, settings, navigation, and renderers. Move only behavior that is demonstrably provider-neutral and duplicated; do not move the entire product page into core.                                                                     | Strong recommendation                      |
| P2       | Core observability is inconsistent.                                                  | Product routes use `Effect.log*` and `Effect.annotateLogs`; generic core has few named spans.                                                                                                                                | Add `Effect.withSpan`/`Stream.withSpan` around canonical server use cases and adapter calls after the duplicate server model is resolved. Use structured domain identifiers, never secrets or message content by default.                                                   | Strong recommendation                      |

## What I would remove

I would remove these once the corresponding decisions are made and acceptance tests exist:

1. Provider-specific types and operations from the generic `Chat` facade, if the intended contract is
   truly provider-neutral.
2. AI SDK chunk types from generic persistence, if replay is promoted to a core capability rather
   than an AI SDK transport detail.
3. Any extension wiring that is not owned by a real server prompt/tool composition packet.
4. One of the two production-grade server orchestration paths. Maintaining both indefinitely is
   the largest source of semantic drift I see.
5. Product wrappers in `apps/chat` only after their generic behavior has a real owner in core and
   the wrapper has no remaining product responsibility.

I would not remove `Context.Service`, XState, Effect, Stream, explicit advanced subpaths, or the
anti-slop system. Those are structural improvements, not extraction debris.

## Effect reference patterns to adopt deliberately

The Effect reference repository suggests several useful patterns that are not yet consistently
applied. These should be adopted where they solve a concrete problem, not as a mechanical rewrite:

- Use `Effect.fn`/`Effect.fnUntraced` for named operations and add `Effect.withSpan` at stable
  use-case and adapter boundaries.
- Build dependency-bearing services with `Context.Service` plus `Layer.effect`/`Layer.scoped`,
  yield the service once in the enclosing generator, and return methods that already are Effect
  programs.
- Use `Stream.mapEffect`, `Stream.catchTags`, `Stream.withSpan`, and `Stream.runForEach` for
  incremental work instead of manually mixing async iteration with side effects.
- Use `Effect.acquireRelease`, `Effect.scoped`, and `Layer.scoped` when a database client,
  subscription, stream reader, or external connection has a lifetime to manage.
- Use `Schedule` with `Effect.retry` for explicitly classified transient failures. Do not retry
  domain conflicts or validation errors.
- Keep `Schema.TaggedErrorClass` errors in the error channel and use `Effect.catchTag`/
  `Effect.catchTags` where the tag is the decision. Use `Effect.catch` when a deliberate typed
  mapping needs access to several errors.
- Consider `ManagedRuntime` at a worker/application composition root when layers are stable across
  requests; keep request identity and authentication request-scoped.
- Consider `RequestResolver` only if real batching or deduplication appears. It should not be
  added to ordinary CRUD code just because it exists in Effect.
- Keep pure parsing, mapping, and collection code synchronous when it has no Effect requirement.

## Anti-slop coverage gaps

The current rules cover the previously observed slop very well. I would add deterministic checks
only as the corresponding architecture is settled:

1. A public-surface fixture that fails when provider-specific `OpenAiChat` types appear in the
   generic `Chat` declaration, if the provider-neutral facade decision is accepted.
2. A declaration/boundary check that fails when `server/database` exports an AI SDK type, if
   provider-neutral persisted generation events become the contract.
3. A contextual rule that rejects `Effect.promise` in HealthFit database domains after those
   domains have a shared typed query boundary. Adding the rule before migration would create a
   permanent red baseline.
4. A composition check that detects a service configuration field which has no read site. This is
   better implemented as a small TypeScript/API review fixture than a brittle text rule.
5. A dependency-cycle and unused-export check for package source. Evaluate a real tool such as
   `knip` or dependency-cruiser only after checking compatibility with the workspace toolchain;
   do not add a second overlapping linter casually.
6. A warning report for oversized domain files. I would keep this advisory rather than fail the
   build at an arbitrary line count; cohesive generated/schema files should be exempt.

## Recommended execution order

1. Decide the provider-bound `Chat` contract and the persisted generation-chunk format.
2. Select the canonical server composition path and write an integration fixture around it.
3. Split the three large generic database implementation files without changing their public
   service contracts; then migrate the selected generation representation.
4. Convert the API core and HealthFit persistence boundaries to typed Effect programs, one domain
   at a time, with real SQLite/integration tests.
5. Introduce stable spans, structured logs, and resource-scoped layers at the chosen composition
   root.
6. Add the conditional anti-slop rules and dependency graph checks after the code is in the target
   shape.

## Questions for later discussion

These are intentionally left unanswered for now:

1. Should `@emi/core/chat` remain an explicitly provider-bound subpath, or should provider work be
   available only from `@emi/core/adapters/ai-sdk`?
2. Should persisted generation replay be provider-neutral, or is AI SDK `UIMessageChunk` a
   deliberate advanced transport contract?
3. Is `ChatServerLive` the intended generic production composition, or should `apps/api` remain the
   canonical server and the generic server be clearly labeled as a starter/reference?
4. Should the database implementation split preserve one composite `ConversationDatabase` service,
   or should each capability become a separately provided `Context.Service`?
5. Should extensions participate in server prompt/tool composition now, or remain an explicit
   composition surface until that packet is real?
6. Should the Worker build a long-lived `ManagedRuntime`/Layer graph, with only request identity
   provided per request?
7. Do we want a first-class generic model capability contract for suggestions and web search, or
   should those remain adapter/app feature flags?

## Bottom line

The codebase has a good architecture to maintain. The next quality gain will come from finishing
consolidation and reducing provider-shaped data at advanced boundaries—not from adding more facade
classes, more wrappers, or more lint rules. Until the questions above are answered, the safest
work is documentation, focused tests, and small boundary-preserving refactors.
