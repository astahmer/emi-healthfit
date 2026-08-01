# @emi/core audit report

Date: 2026-08-02  
Scope: packages/core, its public entrypoints, core tests, and the canonical generic-web integration  
Mode: review only; no source changes made

## Executive verdict

@emi/core has a solid architectural spine. The actor composition is real, adapter injection is respected, the generic app is now a React projection of actors, the headless/styled split exists, and the package has meaningful boundary and actor tests.

It is not yet a high-standard standalone package or a safe external distribution contract. Five issues are release blockers for a reusable core:

1. Untrusted citation and file URLs bypass the existing URL safety policy.
2. Successful conversation deletion feeds the request event back into the actor, causing repeated deletion attempts.
3. Caller-provided transport body fields can overwrite protected sessionId, threadId, and temporary values.
4. The generic Worker route persists a user message before generation admission, so the one-active-generation race can leave durable orphan messages.
5. Conversation, thread, and memory loads have no request identity or latest-wins rule, so stale responses can overwrite newer UI state.

The mixed-layer shape itself is intentional and acceptable. Actors, headless web components, styled components, server logic, and platform adapters can live in one go-to library when subpaths define the supported consumption boundary. The remaining package-level gaps are different: generic and HealthFit API composition is not explicit, the same resources have competing DTO shapes, the package is private and source-only, and public-package/coverage checks are not enforced. These are contract and distribution concerns, not an objection to having multiple capability layers.

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

## Evidence collected

| Check | Result | Meaning |
| --- | --- | --- |
| pnpm --dir packages/core typecheck | Pass | Strict core types currently compile. |
| pnpm --dir packages/core lint | Pass | No production lint failure. Oxlint reports only non-blocking test-hygiene warnings. |
| pnpm --dir packages/core test | Pass: 62 Node tests and 60 Vitest tests | Existing coverage is useful but does not cover the failures below. |
| pnpm slop:check | Pass | Current AST slop rules match nothing; this does not detect behavioral slop. |
| React Doctor JSON scan | 10 warnings | One warning is a real boundary bug; the others are triaged below. |
| npm pack --dry-run --json from packages/core | Pass, 92 source files | The package contains TypeScript source, not built JavaScript or declarations. package.json remains private. |
| Real createActor deletion repro | Failed behaviorally | A successful delete was called three times before the test client rejected it. |

## Findings

### CORE-001 — Blocker: non-Markdown URL sinks bypass the safety policy

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

### CORE-002 — Blocker: successful conversation deletion loops back into the request path

Locations:

- [conversation-store-actor.ts:207-216](../packages/core/src/web/chat-runtime/conversation-store-actor.ts) sends the original conversation-delete-requested event after the client resolves.
- [conversation-store-actor.ts:479-493](../packages/core/src/web/chat-runtime/conversation-store-actor.ts) forwards that request to the operations actor and only handles conversation-deleted as the success event.

The success callback must emit { type: "conversation-deleted", conversationId, resetSession }. It currently emits event, whose type is still conversation-delete-requested. The outer machine forwards it again, so a successful deletion starts another deletion. The real actor repro reached three client calls before the test client rejected the third call.

Required follow-up:

- Emit the typed success event exactly once.
- Add a real createActor test that resolves deletion and asserts one client call, the conversation is removed, mutation loading ends, and resetSession is honored.
- Add a rejected-delete test so the failure path remains distinct from the success path.

### CORE-003 — Blocker: transport request-body mass assignment overrides protected fields

Locations:

- [chat-transport-actor.ts:6-14](../packages/core/src/web/chat-runtime/chat-transport-actor.ts) accepts body: Record<string, unknown>.
- [chat-transport-actor.ts:98-103](../packages/core/src/web/chat-runtime/chat-transport-actor.ts) spreads request.body after core-owned fields.

Because custom fields are spread last, a caller can pass body.sessionId, body.threadId, or body.temporary and replace the values derived from the typed request. This is exactly the kind of reusable-boundary bug that becomes dangerous when a fork adds a new caller or forwards user-controlled configuration.

Required follow-up:

- Make protected transport fields impossible to override: either spread extension data first and assign protected fields last, or define a typed extension object that excludes reserved keys.
- Add an actor test that sends malicious collisions and inspects the actual fetch request JSON. The assertion must cover all three protected fields and both defined/undefined thread IDs.
- Document which body keys are extension-owned and which are transport-owned.

### CORE-004 — High: generation admission occurs after durable user-message persistence

Locations:

- [chat-routes.ts:663-679](../packages/core/src/cloudflare/chat-routes.ts) checks only whether the same requestId already exists.
- [chat-routes.ts:704-720](../packages/core/src/cloudflare/chat-routes.ts) persists the user message.
- [chat-routes.ts:732-740](../packages/core/src/cloudflare/chat-routes.ts) creates the generation afterward.
- [schema.ts:169-179](../packages/core/src/server/db/schema.ts) enforces one active generation per conversation at the database boundary.

Two different request IDs can pass the application-level check concurrently. Both can persist a user message; one then loses the partial unique-index race in createGeneration. The route has already mutated conversation history when generation admission fails, leaving an orphan user turn and an error response. The separate API route has explicit GenerationAlreadyActiveError handling, but the generic Cloudflare route does not establish the same atomicity around message persistence.

Required follow-up:

- Decide the invariant explicitly: generation admission must either precede message persistence or the message/generation transition must be one rollback-safe transaction.
- Preserve idempotency for repeated request IDs while returning a structured conflict for a different active generation.
- Add a real SQLite/D1-compatible concurrency test with two requests and assert no unpaired user message remains after the losing request.

### CORE-005 — High: async store responses have no latest-wins or cancellation semantics

Locations:

- [conversation-store-actor.ts:108-179](../packages/core/src/web/chat-runtime/conversation-store-actor.ts) starts list/detail operations without operation IDs, abort signals, or stale-result checks.
- [conversation-store-actor.ts:181-193](../packages/core/src/web/chat-runtime/conversation-store-actor.ts) accepts every completion and sends it to the parent.
- [apps/generic-web/src/app.tsx:355-377](../apps/generic-web/src/app.tsx) dispatches conversation and memory searches on every keystroke.

An older search response can arrive after a newer search and overwrite the newer list. The same shape affects conversation/thread loads and the refreshes triggered by conversation-identified. The existing transport actor correctly tracks operation identity for streams; the store actor does not apply the same discipline to queries.

Required follow-up:

- Give each independently replaceable query an operation identity and ignore stale completions, or cancel the prior request with an injected AbortSignal.
- Debounce high-frequency search at the view boundary or actor boundary, with one clearly owned policy.
- Add delayed-promise actor tests for out-of-order conversation and memory searches, plus conversation/thread selection changes. Assert that the newest request wins and loading flags do not get cleared by stale work.

### CORE-006 — Medium: generic and HealthFit contract composition is not explicit

Locations:

- [contract/data.ts:45-262](../packages/core/src/contract/data.ts) defines analytics, export, privacy, workouts, and Hevy integration groups alongside generic suggestions and memory extraction.
- [contract/index.ts:1-34](../packages/core/src/contract/index.ts) exports them from the base contract and adds them to EmiApi.
- [contract/healthfit.ts:1-2](../packages/core/src/contract/healthfit.ts) only re-exports the domain groups; it does not remove them from the base entrypoint.

This is not a mixed-layer violation. The package can intentionally ship generic chat contracts and HealthFit contracts together. The issue is that the current naming and composition do not tell a consumer which contract is the generic baseline and which groups are HealthFit-specific: importing @emi/core/contract exposes the domain groups, and EmiApi adds them by default.

There are two valid product decisions:

- If this is intentionally a HealthFit-first go-to package, keep the groups but document and name that composition clearly so consumers know the default API is product-specific.
- If generic chat/agent applications are first-class external consumers, expose a clearly generic CoreApi and make the HealthFit groups an explicit extension/composition subpath.

The defect is the implicit contract, not the presence of multiple contract layers.

Required follow-up:

- Choose and document the intended default contract composition.
- If generic consumers are first-class, define a generic CoreApi and make the HealthFit groups an explicit extension entrypoint.
- Add contract tests that prove the documented composition and prevent accidental domain groups from appearing in an unintended baseline.

### CORE-007 — High: external distribution is not a supported package mode yet

Evidence:

- [packages/core/package.json:2-25](../packages/core/package.json) marks the package private and maps exports directly to .ts/.tsx source files.
- [packages/core/package.json:27-34](../packages/core/package.json) has no build, declaration, or package-smoke script.
- [packages/core/package.json:36-70](../packages/core/package.json) puts server, Cloudflare, database, AI, styling, and web runtime dependencies in one monolithic dependency set.
- [packages/core/PUBLISH.md:1-20](../packages/core/PUBLISH.md) explicitly says not to publish until a dual-build is completed.
- npm pack --dry-run --json contains 92 source files and no built JavaScript or declaration output.
- [knip.json:1-20](../knip.json) does not configure packages/core, so unused core exports and dependencies are not part of the repository’s dead-code audit.

The mixed-layer package is not the problem. A single package can intentionally provide all these capabilities through subpaths. The source-copy mode is a reasonable shadcn-like fork strategy, but it is currently undocumented as a versioned distribution contract. The registry/import mode is not ready. Simply flipping private to false would publish a source tree whose consumers still need the workspace toolchain and every platform dependency.

Required follow-up:

- Make the two intended modes explicit:
  - Source mode: copied source and tests, a clear ownership boundary, a manifest/version marker, and an upgrade/diff procedure for forks.
  - Registry mode: built ESM/CJS policy as appropriate, .d.ts, curated conditional exports, package-level peer/optional dependency strategy, README/license metadata, and a packed-install smoke test from a clean consumer.
- Keep one package if that is the intended experience, but make subpath dependency isolation deliberate: optional/peer dependencies or an equivalent strategy for styled and platform-only consumers, and clean-install tests for each supported subpath.
- Add CI checks for pack, public subpath imports, and the generated source-copy path.
- Add packages/core to dead-export/dependency analysis once the public API is curated.

### CORE-008 — High: competing DTO schemas make the transport boundary drift-prone

Locations:

- [contract/conversations.ts:6-59](../packages/core/src/contract/conversations.ts) uses mixed snake_case wire fields such as created_at, conversation_id, and message_ids, while Message.parts is Schema.Array(Schema.Unknown).
- [conversation-client.ts:6-50](../packages/core/src/web/chat-runtime/conversation-client.ts) defines separate camelCase schemas such as createdAt, conversationId, and anchorMessageId.
- [chat-routes.ts:107-155](../packages/core/src/cloudflare/chat-routes.ts) maps database rows into the camelCase worker response shape.

These may represent two deliberate protocols, but the distinction is not expressed in names or a shared mapper layer. They are two independently maintained definitions of the same conversation/thread/message concepts. A fork can update one path and silently leave the other stale; the Unknown parts schema also weakens the contract at the API boundary.

Required follow-up:

- Choose one canonical schema per protocol and name the protocol explicitly.
- Keep raw database rows, wire DTOs, and client domain types separate, with enumerating mappers at the boundary.
- Add encoding/decoding fixtures for every public conversation, thread, memory, and message response, including malformed parts and field-name drift.

### CORE-009 — Medium: coverage and public-API verification are not enforceable

Evidence:

- [packages/core/vitest.config.ts](../packages/core/vitest.config.ts) configures jsdom and test inclusion but no coverage provider, thresholds, or coverage script.
- Core tests predominantly import internal source paths such as ../../src/web/chat-runtime/..., so passing tests do not prove that the package exports work from a packed consumer.
- [entry-isolation.test.ts:41-116](../packages/core/test/entry-isolation.test.ts) performs useful source-text isolation checks, but it is not an import/pack/install test.

The current pass count is not a coverage claim. The deletion, body-collision, URL-sink, stale-response, and concurrency gaps all exist while the suite is green. A high-standard package needs explicit behavioral coverage for ownership boundaries and a separate compatibility check for the public package surface.

Required follow-up:

- Set branch-aware coverage thresholds for actor transitions, boundary/security helpers, codecs, and public entrypoints; avoid using one blind line threshold for every layer.
- Keep internal unit tests, but add public-subpath tests and a packed clean-consumer smoke test.
- Make security and concurrency regression tests mandatory in the package test command.

### CORE-010 — Medium: stable subpath contracts are not explicit enough

Locations:

- [web/index.ts:1-16](../packages/core/src/web/index.ts) wildcard-exports contributions, every actor, the client, session machine, auth helper, and internal conversation helpers.
- [server/index.ts:1-16](../packages/core/src/server/index.ts) wildcard-exports database schemas and low-level persistence functions.
- [contract/index.ts:1-5](../packages/core/src/contract/index.ts) wildcard-exports every contract module.

The broad API is not itself a problem for a go-to library, and exporting actors, clients, contribution registries, and styled primitives through subpaths is intentional. The maintenance risk is that wildcard barrels make it unclear which symbols are stable contracts versus advanced implementation hooks. That ambiguity makes independent consumers and forks harder to upgrade safely.

Required follow-up:

- Curate and document stable symbols per subpath. Keep low-level implementation modules reachable through intentionally named advanced subpaths when there is a real use case.
- Document the stable contract for actor inputs/events, client adapters, contribution registries, and styled components.
- Use export-surface tests to prevent accidental additions and removals.

### CORE-011 — Medium: browser draft persistence has two competing implementations

Locations:

- [browser-state-actor.ts:35-62](../packages/core/src/web/chat-runtime/browser-state-actor.ts) contains an invoked callback receive branch that handles draft-persist-requested.
- [browser-state-actor.ts:82-86](../packages/core/src/web/chat-runtime/browser-state-actor.ts) contains the machine action that performs the same storage write.
- [browser-state-actor.ts:100-105](../packages/core/src/web/chat-runtime/browser-state-actor.ts) routes the event to the machine action; it does not send the event to the invoked operations actor.

The callback branch is dead under the current topology, while both paths describe storage ownership. This is actor plumbing slop: it makes ownership and error behavior ambiguous and invites a future double-write when someone changes routing.

Required follow-up:

- Keep exactly one persistence path and one error-reporting path.
- Make the test assert the chosen path, including a storage exception, rather than only asserting the final write list.

### CORE-012 — Low: typed forwarding actions contain unreachable sentinel fallbacks

Location: [generic-chat-app-machine.ts:60-100](../packages/core/src/web/chat-runtime/generic-chat-app-machine.ts).

Each forwarding action is installed under a parent event key that already narrows the event type, but the action still returns unrelated fallback events such as fresh-started, browser-noop, stream-cancelled, threads-cleared, or an empty settings patch. These sentinels are unreachable in the declared topology and become dangerous if the action is later reused under a broader event handler.

Required follow-up:

- Replace the fallback pattern with typed forwarding helpers or event-specific actions that cannot emit a fabricated event.
- Add a parent-routing test that checks the intended event reaches each child and no sentinel event is emitted.

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

No changes are made in this report. When implementation starts, use focused JJ revisions in this order:

1. Fix and cover CORE-001, CORE-002, and CORE-003. These are direct security/correctness failures.
2. Make generation admission atomic and add the real concurrent persistence test for CORE-004.
3. Add latest-wins/cancellation semantics and delayed-response actor tests for CORE-005.
4. Make generic and HealthFit contract composition explicit, if both are supported, and remove DTO duplication for CORE-006 and CORE-008.
5. Keep the intentional one-package/subpath model, then implement the two distribution modes in CORE-007 with pack/import/generated-source acceptance before calling the package publishable.
6. Establish coverage thresholds, public export checks, and dead-code analysis for CORE-009 and CORE-010.
7. Remove the duplicate browser persistence path and fabricated forwarding fallbacks (CORE-011 and CORE-012).
8. Re-run React Doctor and only take the small-array/performance suggestions that are justified by profiling or touched code.

The release bar should be: focused actor/security/integration tests pass, packed public imports pass from a clean consumer, generated source mode passes, pnpm slop:check passes, and the final repository release check passes immediately before handoff.
