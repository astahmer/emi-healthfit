# @emi/core audit report

Date: 2026-08-02  
Scope: packages/core, its public entrypoints, core tests, and the canonical generic-web integration  
Mode: initial review followed by the target-contract implementation; remaining application and
adapter cleanup is tracked as implementation work below.

## Executive verdict

@emi/core has a solid architectural spine. The actor composition is real, adapter injection is respected, the generic app is now a React projection of actors, the headless/styled split exists, and the package has meaningful boundary and actor tests.

The initial review found five release-blocking behavioral defects plus one high-severity product-boundary defect. The focused implementation pass now fixes and covers all six:

1. Untrusted citation and file URLs bypassed the existing URL safety policy.
2. Successful conversation deletion fed the request event back into the actor, causing repeated deletion attempts.
3. Caller-provided transport body fields could overwrite protected sessionId, threadId, and temporary values.
4. The generic Worker route persisted a user message before generation admission, so the one-active-generation race could leave durable orphan messages.
5. Conversation, thread, and memory loads had no request identity or latest-wins rule, so stale responses could overwrite newer UI state.
6. HealthFit-specific API contracts were exported from the generic core instead of a product flavor.

The fixes are deliberately narrow and test-first: regression tests were added before the source fixes, the pre-fix route test observed two persisted user turns, and the post-fix test observes one turn plus a structured 409 for the losing request.

The mixed-layer shape itself is intentional and acceptable. Actors, headless web components, styled components, server logic, and platform adapters can live in one go-to library when subpaths define the supported consumption boundary. The initial review also found that HealthFit API contracts leaked into the generic core; that boundary is now fixed by moving the product composition into `@emi/flavor-healthfit/contract`. The target catalog and packed/source checks define the generic distribution boundary. Quantitative coverage thresholds and remaining adapter cleanup remain separately owned follow-up work, not hidden public-core promises.

The report is intentionally selective. Mechanical slop checks pass, and most React Doctor findings are small-array optimization suggestions or intentional shadcn-style exports. They should not become churn without evidence.

## Design interpretation

The target package is intentionally broad. The right quality bar is not layer purity or splitting every capability into a separate package:

| Capability layer | Valid role in one package |
| --- | --- |
| Actors and machines | Reusable conversation, transport, persistence, browser, and UI logic. |
| Headless web | Selectors, event contracts, shells, message primitives, and adapter-facing client behavior. |
| Styled web | Optional shadcn/Radix-style components and CSS consumers can opt into through a subpath. |
| Server and platform adapters | Durable storage, request context, Cloudflare/D1 wiring, replay, and route factories. |
| Contract and integrations | Generic chat/agent contracts plus explicitly named domain extensions. |

Review decisions below therefore distinguish intentional breadth from accidental coupling. Keep the one-package/subpath model if it is the desired developer experience. Enforce each subpath’s dependency, export, and runtime assumptions instead of treating the presence of multiple layers as slop.

## Clean-slate direction

The initial review produced a detailed clean-slate API blueprint. It now lives in
plans/core-api-rewrite-plan.md, which is the normative target and agent handoff document.

This separation is intentional:

- this audit records current evidence, completed fixes, remaining findings, and release-gate
  status;
- the rewrite plan describes the best API independent of backward compatibility and maps that
  target into test-first implementation packets; and
- the rewrite plan explicitly keeps XState and Effect as first-class implementation engines while
  hiding their wiring from the common consumer path and exposing advanced opt-in subpaths.

The audit and rewrite plan should be read together. Do not reintroduce the historical extraction
shape merely because the current implementation uses it, and do not treat the intentionally
mixed-layer package as a defect. The constraints that remain non-negotiable are generic core
ownership, actor state ownership, explicit schema/mappers, injected platform dependencies, curated
exports, and real boundary/integration tests.


## Evidence collected

| Check | Result | Meaning |
| --- | --- | --- |
| pnpm --dir packages/core typecheck | Pass | Strict core types currently compile. |
| pnpm --dir packages/core lint | Pass | No production lint failure. Oxlint reports only non-blocking test-hygiene warnings. |
| pnpm --dir packages/core test | Pass | Core Node, browser-facing, public-surface, adapter, and packed-consumer tests pass. |
| pnpm --dir packages/flavor-healthfit test | Pass: 39 tests | HealthFit contract composition and existing flavor tests pass. |
| pnpm slop:check | Pass | Current AST slop rules match nothing; this does not detect behavioral slop. |
| React Doctor JSON scan | 10 warnings | The request-body warning was fixed; remaining findings are triaged below. |
| pnpm --dir packages/core build + clean packed consumer | Pass | Registry mode emits ESM/declarations; the packed fixture imports every target subpath from a clean consumer. |
| pnpm verify:chat-app | Pass | Owned source mode installs, typechecks, generates/checks migrations, builds, and exercises the generated Worker/web fixture. |
| pnpm slop:check | Pass | Final export-surface and anti-pattern checks pass. |
| Real createActor deletion repro | Fixed | The regression test now proves one delete call and typed completion. |

## Implementation follow-up

The behavioral findings are now covered by focused revisions:

- `test(core): cover audit regressions` covers URL sinks, protected transport fields, deletion success, stale store responses, and browser persistence errors.
- `fix(core): harden web actors and URL sinks` applies the URL allow-list, reserves transport-owned fields, adds latest-wins query identity, removes fabricated forwarding fallbacks, and routes draft persistence through the operations actor.
- `test(core): cover generation admission ordering` adds a real SQLite/D1-compatible concurrent route test.
- `fix(core): admit generations before turn persistence` admits the active generation before saving the user turn, marks admitted generations failed when setup fails, and returns a structured 409 conflict.
- `fix(core): preserve generic message identity` passes the validated client message ID through generic persistence so retry/edit/branch operations can address the stored turn.
- `fix(core): expose generic contract composition` establishes `CoreApi` as the generic contract composition.
- `fix(core): move HealthFit contracts into the flavor` removes product API groups from `@emi/core/contract`, adds `@emi/flavor-healthfit/contract`, and updates the product route/client compositions to import `HealthFitApi` from the flavor.

The findings below distinguish target-contract closure from application migration and quantitative
quality work; none is a reason to split the intentionally mixed-layer package.

## Findings

### CORE-001 — Fixed blocker: non-Markdown URL sinks bypassed the safety policy

Locations:

- [tool-result-content.tsx:43-70](../packages/core/src/web/thread/tool-result-content.tsx) renders citation.url directly into href.
- [message-part.tsx:21-40](../packages/core/src/web/thread/message-part.tsx) renders arbitrary file-part URLs into src and href.
- [markdown-url-policy.ts:1-29](../packages/core/src/web/thread/markdown-url-policy.ts) already defines the correct allow-list, but only Markdown uses it.

Tool results are decoded from Schema.Unknown, and stored UI message parts retain open-ended fields. The Markdown renderer correctly blocks javascript:, data:, vbscript:, protocol-relative, and other unsafe URLs. Citation links and file parts skip that policy entirely. A malicious tool/provider result or persisted message can therefore create an executable link or an unsafe resource sink.

This is a security boundary, not a styling issue. target="_blank" and rel="noopener noreferrer" do not make an unsafe scheme safe.

Required follow-up:

- Centralize policies for navigational URLs, attachment URLs, and image URLs.
- Apply them at every non-Markdown sink; render blocked values as text or an explicit blocked attachment state.
- Add component-level tests for javascript:, data:text/html, protocol-relative URLs, allowed HTTPS URLs, and the intended attachment cases. Testing only the helper is insufficient because the current bug is a missing call site.

Implementation: `isSafeMarkdownHref` now guards citations, and `isSafeAttachmentUrl` guards file links and image sources. Unsafe values render as text or `[attachment blocked]`; the thread-shell regression tests exercise the actual sinks.

### CORE-002 — Fixed blocker: successful conversation deletion looped back into the request path

Locations:

- [conversation-store-actor.ts:207-216](../packages/core/src/web/chat-runtime/conversation-store-actor.ts) sends the original conversation-delete-requested event after the client resolves.
- [conversation-store-actor.ts:479-493](../packages/core/src/web/chat-runtime/conversation-store-actor.ts) forwards that request to the operations actor and only handles conversation-deleted as the success event.

The success callback must emit { type: "conversation-deleted", conversationId, resetSession }. It currently emits event, whose type is still conversation-delete-requested. The outer machine forwards it again, so a successful deletion starts another deletion. The real actor repro reached three client calls before the test client rejected the third call.

Required follow-up:

- Emit the typed success event exactly once.
- Add a real createActor test that resolves deletion and asserts one client call, the conversation is removed, mutation loading ends, and resetSession is honored.
- Add a rejected-delete test so the failure path remains distinct from the success path.

Implementation: the callback now emits `conversation-deleted`, and the real `createActor` test asserts one client call, removal, loading cleanup, and session reset.

### CORE-003 — Fixed blocker: transport request-body mass assignment overrode protected fields

Locations:

- [chat-transport-actor.ts:6-14](../packages/core/src/web/chat-runtime/chat-transport-actor.ts) accepts body: Record<string, unknown>.
- [chat-transport-actor.ts:98-103](../packages/core/src/web/chat-runtime/chat-transport-actor.ts) spreads request.body after core-owned fields.

Because custom fields are spread last, a caller can pass body.sessionId, body.threadId, or body.temporary and replace the values derived from the typed request. This is exactly the kind of reusable-boundary bug that becomes dangerous when a fork adds a new caller or forwards user-controlled configuration.

Required follow-up:

- Make protected transport fields impossible to override: either spread extension data first and assign protected fields last, or define a typed extension object that excludes reserved keys.
- Add an actor test that sends malicious collisions and inspects the actual fetch request JSON. The assertion must cover all three protected fields and both defined/undefined thread IDs.
- Document which body keys are extension-owned and which are transport-owned.

Implementation: extension fields are spread first and transport-owned `sessionId`, `threadId`, and `temporary` fields are assigned last. The actor test inspects serialized request JSON, including an explicitly cleared thread id.

### CORE-004 — Fixed high: generation admission occurred after durable user-message persistence

Locations:

- [chat-routes.ts:663-679](../packages/core/src/cloudflare/chat-routes.ts) checks only whether the same requestId already exists.
- [chat-routes.ts:704-720](../packages/core/src/cloudflare/chat-routes.ts) persists the user message.
- [chat-routes.ts:732-740](../packages/core/src/cloudflare/chat-routes.ts) creates the generation afterward.
- [schema.ts:169-179](../packages/core/src/server/db/schema.ts) enforces one active generation per conversation at the database boundary.

Two different request IDs can pass the application-level check concurrently. Both can persist a user message; one then loses the partial unique-index race in createGeneration. The route has already mutated conversation history when generation admission fails, leaving an orphan user turn and an error response. The separate API route has explicit GenerationAlreadyActiveError handling, but the generic Cloudflare route does not establish the same atomicity around message persistence.

Implementation: the generic Cloudflare route admits the generation before persisting the incoming user turn, marks the admitted generation failed if setup fails, and maps `GenerationAlreadyActiveError` to a structured 409. The SQLite/D1-compatible integration test runs two concurrent requests and asserts one persisted user turn plus a 409 for the losing request.

### CORE-005 — Fixed high: async store responses had no latest-wins or cancellation semantics

Locations:

- [conversation-store-actor.ts:108-179](../packages/core/src/web/chat-runtime/conversation-store-actor.ts) starts list/detail operations without operation IDs, abort signals, or stale-result checks.
- [conversation-store-actor.ts:181-193](../packages/core/src/web/chat-runtime/conversation-store-actor.ts) accepts every completion and sends it to the parent.
- [apps/generic-web/src/app.tsx:355-377](../apps/generic-web/src/app.tsx) dispatches conversation and memory searches on every keystroke.

An older search response can arrive after a newer search and overwrite the newer list. The same shape affects conversation/thread loads and the refreshes triggered by conversation-identified. The existing transport actor correctly tracks operation identity for streams; the store actor does not apply the same discipline to queries.

Required follow-up:

- Give each independently replaceable query an operation identity and ignore stale completions, or cancel the prior request with an injected AbortSignal.
- Debounce high-frequency search at the view boundary or actor boundary, with one clearly owned policy.
- Add delayed-promise actor tests for out-of-order conversation and memory searches, plus conversation/thread selection changes. Assert that the newest request wins and loading flags do not get cleared by stale work.

Implementation: each replaceable store query now has an actor-local identity; stale success and failure events are ignored. The conversation-store actor tests cover out-of-order conversation search and selection loads.

### CORE-013 — Fixed high: generic chat persistence dropped validated message identity

The generic Cloudflare route persisted the last validated user message with only its role and
parts. `saveConversationMessages` therefore generated a new database ID even though the client
message already had a stable ID. Retry, edit, branch, and reconciliation operations could then
address the client ID while the stored turn used a different ID.

Implementation: generic persistence now passes `lastMessage.id` to the server store. The real
SQLite route regression asserts that the stored user turn keeps the client-generated ID. This
also follows the repository anti-slop rule requiring client message IDs to survive persistence.

### CORE-006 — Fixed high: HealthFit-specific API contracts leaked into generic core

Locations:

- [packages/core/src/contract/data.ts](../packages/core/src/contract/data.ts) defined analytics, export, privacy, workouts, and Hevy integration groups alongside generic suggestions and memory extraction.
- [packages/core/src/contract.export.ts](../packages/core/src/contract.export.ts) exports those domain groups from the generic contract entrypoint.
- [packages/flavor-healthfit/src/contract.export.ts](../packages/flavor-healthfit/src/contract.export.ts) now owns the HealthFit composition over `CoreApi`.

This is a real core-boundary violation under the intended direction. `@emi/core` provides the
foundations that make HealthFit or another chat/agent product possible; it must not contain or
export HealthFit-specific APIs. Leaving analytics, fitness data, privacy, workouts, and Hevy
groups in the core contract made the generic package product-aware and forced generic consumers
to depend on a domain contract they did not opt into. The mixed-layer package shape remains
intentional; the product-domain ownership boundary is not.

Tests were written before the move. The core regression first failed because all five HealthFit
API exports were present, and the flavor regression failed because its public contract entry did
not exist. The target catalog now removes the historical contract barrel from `@emi/core`
entirely. The generic protocol is owned by `ChatProtocol`; HealthFit remains an explicit flavor
composition over `CoreApi`, and the product contract is owned by the flavor package. Core and
flavor tests assert the separation.

### CORE-007 — Closed for the target catalog; application migration reclassified

Evidence: `packages/core/package.json` is publishable, its target exports point only to built ESM
and declaration files, `source-manifest.json` is generated from the same catalog, and the packed
consumer imports every supported target subpath. `pnpm verify:chat-app` also exercises the owned
source distribution and generated application. Application-specific helpers remain in their
owning application packages and are not published by generic core.

Reclassification: owner `apps/api`, `apps/chat`, `apps/discord-bot`, `apps/generic-worker`, and
`packages/flavor-healthfit`; next work is application-specific migration, not another public
`@emi/core` compatibility export.

### CORE-008 — Closed for the target catalog; historical app DTOs reclassified

Locations:

- [contract/conversations.ts:6-59](../packages/core/src/contract/conversations.ts) uses mixed snake_case wire fields such as created_at, conversation_id, and message_ids, while Message.parts is Schema.Array(Schema.Unknown).
- [conversation-client.ts:6-50](../packages/core/src/web/chat-runtime/conversation-client.ts) defines separate camelCase schemas such as createdAt, conversationId, and anchorMessageId.
- [chat-routes.ts:107-155](../packages/core/src/cloudflare/chat-routes.ts) maps database rows into the camelCase worker response shape.

The target protocol now has one named `ChatProtocol` schema/mapper owner and an Effect error
channel. Public consumers do not see the historical app DTOs, raw rows, or `Schema.Unknown`
boundary. The old application route/client DTOs remain only in their owning application packages and are
owned by the application boundary listed under CORE-007.

### CORE-009 — Reclassified: quantitative coverage policy remains post-rewrite quality work

Evidence:

- [packages/core/vitest.config.ts](../packages/core/vitest.config.ts) configures jsdom and test inclusion but no coverage provider, thresholds, or coverage script.
- Core tests predominantly import internal source paths such as ../../src/web/chat-runtime/..., so passing tests do not prove that the package exports work from a packed consumer.
- [entry-isolation.test.ts:41-116](../packages/core/test/entry-isolation.test.ts) performs useful source-text isolation checks, but it is not an import/pack/install test.

The target now has compile-time consumer fixtures, exact export snapshots, public subpath imports,
packed clean-consumer checks, security/concurrency regressions, and generated-source acceptance in
the required package gates. A quantitative, branch-aware coverage budget is still intentionally
not invented from a single blind line threshold. Owner: core maintainers; next packet is a
post-rewrite quality-policy change if CI requires numeric thresholds.

### CORE-010 — Closed for the target catalog

Evidence:

- [packages/core/package.json](../packages/core/package.json) is the single machine-readable
  export catalog and dependency matrix.
- [packages/core/test/public-api/export-surface.test.ts](../packages/core/test/public-api/export-surface.test.ts)
  asserts exact target names for every public subpath.
- [packages/core/test/pack](../packages/core/test/pack) imports the built tarball from a clean
  consumer, while the generated owned-source fixture exercises the source mode.

The target package uses an explicit catalog and exact export-surface tests. Domain operations are
grouped under `ChatProtocol`, `CoreApiClient`, `ChatExtensions`, `ChatServer`, and `ChatTesting`;
the only intentionally broad exports are independently consumable React view primitives. Raw
XState is opt-in under `advanced/xstate`, and Effect server construction is opt-in under
`server/effect`. Old source-shaped names and wildcard public barrels are absent from the package
exports.

### CORE-011 — Fixed medium: browser draft persistence had two competing implementations

Locations:

- [browser-state-actor.ts:35-62](../packages/core/src/web/chat-runtime/browser-state-actor.ts) contains an invoked callback receive branch that handles draft-persist-requested.
- [browser-state-actor.ts:82-86](../packages/core/src/web/chat-runtime/browser-state-actor.ts) contains the machine action that performs the same storage write.
- [browser-state-actor.ts:100-105](../packages/core/src/web/chat-runtime/browser-state-actor.ts) routes the event to the machine action; it does not send the event to the invoked operations actor.

The callback branch is dead under the current topology, while both paths describe storage ownership. This is actor plumbing slop: it makes ownership and error behavior ambiguous and invites a future double-write when someone changes routing.

Required follow-up:

- Keep exactly one persistence path and one error-reporting path.
- Make the test assert the chosen path, including a storage exception, rather than only asserting the final write list.

Implementation: draft persistence now has one operations-actor path, and the browser actor test asserts storage failures reach actor context.

### CORE-012 — Fixed low: typed forwarding actions contained unreachable sentinel fallbacks

Location: [generic-chat-app-machine.ts:60-100](../packages/core/src/web/chat-runtime/generic-chat-app-machine.ts).

Each forwarding action is installed under a parent event key that already narrows the event type, but the action still returns unrelated fallback events such as fresh-started, browser-noop, stream-cancelled, threads-cleared, or an empty settings patch. These sentinels are unreachable in the declared topology and become dangerous if the action is later reused under a broader event handler.

Required follow-up:

- Replace the fallback pattern with typed forwarding helpers or event-specific actions that cannot emit a fabricated event.
- Add a parent-routing test that checks the intended event reaches each child and no sentinel event is emitted.

Implementation: valid forwarding actions route their typed event directly; invalid forwarding events throw instead of fabricating unrelated child events.

## React Doctor triage

The scan returned 10 warnings. Only the transport warning is a blocker and is already tracked as CORE-003.

| Location | Rule | Disposition |
| --- | --- | --- |
| src/chat/openai.ts:51 | js-combine-iterations | Defer. Small generated-string collection; optimize only with a profile or while changing the function. |
| src/cloudflare/chat-routes.ts:439 | js-combine-iterations | Defer. Route-local conversation filtering; not evidence of a meaningful hot path. |
| src/server/app-definition.ts:37 | js-combine-iterations | Low-priority cleanup if touched; contributor definitions are small. |
| src/server/app-definition.ts:69 | no-spread-accumulator-in-reduce | Low-priority cleanup. The algorithmic warning is valid in isolation, but the input is configuration-sized. |
| src/server/db/memories.ts:44 | js-combine-iterations | Defer pending memory-result size/profile. |
| src/web/chat-runtime/chat-transport-actor.ts:102 | request-body-mass-assignment | Fix. This is CORE-003. |
| src/web/contributions.tsx:42,45 | only-export-components | Accept. The registry and hook are intentional public contribution API, not accidental exports. |
| src/web/styled/chat-content.tsx:95 | js-combine-iterations | Defer. Small render-time minimap collection; profile before changing readability. |
| src/web/styled/ui/button.tsx:62 | only-export-components | Accept. Exporting buttonVariants is the intended shadcn-style API. |

The non-failing Oxlint warnings are concentrated in tests (no-await-in-loop, consistent-function-scoping, and one JSX-as-prop warning). They are not production slop and should not be used to inflate this audit.

## What is already correct and should be preserved

- The generic root actor context contains adapters and wiring, not duplicated child snapshots. This matches the project’s actor ownership rule.
- apps/generic-web uses useActorRef/useSelector; it does not reintroduce React state for app, network, storage, or domain state. The remaining useState uses are ephemeral styled-component concerns such as copied-message feedback and responsive presentation.
- Core web/server/chat/contract boundaries inject fetch, API origins, browser, and storage adapters instead of reading Vite or browser globals from runtime actors.
- Headless web and styled web are separate export paths, and the isolation tests prevent the headless path from importing styled dependencies.
- Existing boundary tests reject app, HealthFit, and platform leakage from the relevant core entries.
- Existing tests use real createActor instances for the actor runtime; this should remain the standard.
- pnpm slop:check is green. The audit findings above are behavioral and boundary issues that AST rules cannot currently see.

## Recommended execution order

The target catalog is frozen; remaining work is focused actor/security/integration validation,
adapter cleanup, explicit export snapshots, `pnpm slop:check`, and the final repository release
check. No private migration package is retained.
