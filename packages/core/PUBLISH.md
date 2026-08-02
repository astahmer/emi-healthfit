# `@emi/core` public contract and distribution boundary

`@emi/core` is intentionally one mixed-layer package. Actors, provider-neutral chat
protocols, React integration, controlled components, server composition, and platform
adapters remain together behind explicit capability subpaths. The stable R0 catalog is
recorded in `package.json` under `emi.publicApi`; the package `exports` map is curated
against that catalog.

## R0 public catalog

| Import                          | Responsibility                                                                 | Boundary                                                     |
| ------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `@emi/core`                     | `createChatRuntime` and core protocol types                                    | no React, provider, product, database, or platform APIs      |
| `@emi/core/protocol`            | domain messages, parts, IDs, errors, schemas, and extension contracts          | no React, XState, AI SDK, database rows, or platform types   |
| `@emi/core/api`                 | generic HTTP DTOs and `CoreApiClient`                                          | no product routes or persistence details                     |
| `@emi/core/runtime`             | actor-backed runtime facade, selectors, commands, lifecycle, and subscriptions | no React markup or framework hooks                           |
| `@emi/core/react`               | `ChatProvider` and runtime hooks                                               | no styled recipes or module-scope browser globals            |
| `@emi/core/components`          | controlled primitives and connected components                                 | no network, persistence, routing, or mandatory CSS framework |
| `@emi/core/components/styled`   | opt-in connected recipes such as `ChatApp` and `ChatShell`                     | no HealthFit branding or product coupling                    |
| `@emi/core/styles.css`          | design tokens and structural styles                                            | explicit opt-in; no application theme ownership              |
| `@emi/core/server`              | generic ports and server composition                                           | no raw D1, Drizzle, Kysely, or platform rows                 |
| `@emi/core/server/effect`       | explicit Effect-native services and layers                                     | advanced server composition only                             |
| `@emi/core/server/fetch`        | Fetch `Request`/`Response` handlers                                            | no platform bindings                                         |
| `@emi/core/adapters/ai-sdk`     | AI SDK/provider bridge                                                         | provider types stop at this adapter                          |
| `@emi/core/adapters/cloudflare` | Cloudflare, D1, R2, and Worker bindings                                        | platform assumptions stay in the adapter                     |
| `@emi/core/extensions`          | `ChatExtensions` definition and collision-checked composition                  | product domains remain external packages                     |
| `@emi/core/testing`             | `ChatTesting` deterministic dependencies, repositories, and actor harnesses    | test-only helpers, not production state                      |
| `@emi/core/advanced/xstate`     | intentional actor refs and machine integration                                 | raw XState is never the common path                          |

The explicit advanced Effect entrypoint is `@emi/core/server/effect`; R0 does not add a
second `@emi/core/advanced/effect` alias. The common path is therefore:

```tsx
import { createChatRuntime } from "@emi/core";
import { ChatProvider } from "@emi/core/react";
import { ChatApp } from "@emi/core/components/styled";
import "@emi/core/styles.css";

const runtime = createChatRuntime({
  transport: { baseUrl: "/api", fetch },
  storage: { settings, drafts },
  browser: { online, subscribeOnline },
  identity: { createId, now },
  features: { attachments: true, memories: true, branches: true },
});

root.render(
  <ChatProvider runtime={runtime}>
    <ChatApp />
  </ChatProvider>,
);
```

The runtime owns application, transport, persistence, browser, and UI state through XState
actors. React renders selectors and sends commands. The runtime accepts injected fetch, origin,
clock, ID, storage, browser, and persistence dependencies. A common consumer does not import
XState, Effect, AI SDK, D1, or core source files.

## Dependency matrix

The complete machine-readable matrix is `package.json > emi.publicApi.dependencyMatrix`.
Its rules are:

- `protocol` and `api` may use Effect schemas and expose typed Effect error channels, but never
  expose Effect services or layers;
- `runtime` and `advanced/xstate` own XState; React is not a runtime dependency;
- `react` and `components` require React only through their declared peer boundaries;
- `components/styled` keeps visual helpers optional and does not make styling mandatory;
- `server` and `server/fetch` keep generic server contracts free of database/platform packages;
- `adapters/ai-sdk` is the only AI SDK boundary;
- `adapters/cloudflare` is the only Cloudflare/database boundary; and
- `testing` owns deterministic test helpers without becoming a production adapter.

The matrix is enforced by the built package and packed-consumer checks. `components` and
`components/styled` use Effect Schema for safe attachment sinks, so Effect is an implementation
dependency there even though consumers do not compose Effect programs directly.

## API organization and Effect-first rule

Public entrypoints should expose a small number of domain owners. Stateless operations belong on
an explicitly named class with static methods; stateful operations belong on an instance that owns
its dependencies and lifecycle. Avoid flat files that export a long list of related functions or
mutable values. Named TypeScript types may remain individually exported when consumers need them
for annotations. React keeps a deliberately small exception for separately consumable provider and
hook primitives because that is the native composition model and the frozen common-consumer path.

The current named domain owners are `ChatProtocol`, `CoreApiClient`, `ChatExtensions`,
`ChatServer`, and `ChatTesting`. New public operations belong on the owning class or instance
rather than becoming another top-level helper. A group of individually exported React components
is acceptable only when each component is an independently consumable view primitive; it must not
become a miscellaneous utility barrel.

Effect is the canonical form for fallible protocol, server, adapter, and use-case operations. A
canonical method returns `Effect<Success, Error, Requirements>` and preserves its typed failure
channel. Promise APIs are derived at an outer boundary with `Effect.runPromise` or a named wrapper
around it. Do not catch schema failures only to throw a new error from a synchronous helper; use
`Schema.decodeUnknownEffect` and `Effect.mapError` so the success and error channels remain visible
to composition and tests. The runtime's synchronous command methods are an intentional actor
dispatch boundary, not a reason to flatten Effect-based server or protocol work into throws.

## R3 Effect-first server boundary

`@emi/core/server` is the curated generic server entry. `ChatServer` is an instance-owned domain
use case: it receives authentication, repository, model, configuration, and extension ports, then
returns typed `Effect` programs for listing and generating. Generation input is decoded with the
protocol schemas before authentication or persistence; admission runs before user-message
persistence; every emitted generation event is persisted through the generation port; and response
conversations are encoded through the protocol DTO mapper.

`@emi/core/server/effect` exposes `ChatServerEffect.create` for an explicit Effect-native
construction point. `@emi/core/server/fetch` exposes `ChatFetchHandlers`, which derives a
Promise-based `Request`/`Response` boundary with `Effect.runPromise` and maps typed server
failures to HTTP responses. Fetch consumers do not need to know the server's Effect composition
details.

The old database, auth, and AI-SDK-shaped application helpers are isolated in the private
workspace package `@emi/core-migration`. They are not part of the `@emi/core` package exports,
catalog, source manifest, or registry tarball. Existing HealthFit and application workers use
that explicit migration package while their product/platform code is retired or replaced; a
generic consumer must use the target catalog above. The primary server barrel has no wildcard
exports and does not import D1, Drizzle, Kysely, Cloudflare, or AI SDK types.

## R4-R7 implementation and distribution

`@emi/core/adapters/ai-sdk` maps AI SDK streams to the provider-neutral `ModelProvider` Effect
stream. AI SDK imports stop at that adapter; protocol, runtime, components, and server ports do
not expose AI SDK message types. `AiSdkModelProvider.create` is the explicit adapter construction
point.

`@emi/core/components` contains controlled and connected view primitives. `ChatApp` and
`ChatShell` are opt-in recipes under `components/styled`; they render runtime selectors and send
intent actions but do not own application state. Unsafe attachment URLs are rejected with Effect
Schema before they reach an image sink.

`@emi/core/extensions` exposes the Effect-first `ChatExtensions` domain owner. Definitions are
validated, namespaced, collision-checked, immutable, and deterministically ordered. HealthFit's
`healthFitExtension` is owned by `@emi/flavor-healthfit` and is not imported by generic core.

Registry mode is built with:

```sh
pnpm --filter @emi/core source:manifest
pnpm --filter @emi/core build
```

The build reads `emi.publicApi.entrypointPaths`, emits ESM and declarations under `dist/`, and
rewrites emitted-relative declaration imports to `.js`. Target export conditions point at those
emitted files. `test/pack` installs the tarball in a clean temporary consumer, imports all target
subpaths, and typechecks the built declarations.

Source mode copies the same catalog's source paths plus `source-manifest.json`. The manifest
records catalog version, provenance, public entrypoints, source files, and test files. The
`@emi/create-chat-app` owned mode rewrites the copied core package exports to those source paths
and retains the manifest so a fork can compare its local ownership before an upgrade.

## Fixture strategy

R0 has four kinds of compile-time evidence under `test/fixtures`:

- `consumers/` contains literal imports for the common path and every target capability,
  including the explicit XState and Effect paths;
- `contracts/` is a small R0-only declaration layer that expresses the target type shapes before
  R1–R6 create the implementation modules;
- `packed/` compiles every target package subpath from a clean tarball consumer; and
- `rewrite-gates/` contains expected compile-time rejections for internal `src` imports,
  HealthFit APIs, AI SDK message types in protocol, and raw database/platform types in generic
  protocol/server contracts.

`test/public-api/fixtures.test.ts` runs both the contract fixture compiler and the real current
subpath compiler. The target consumers are compile-time contract fixtures, and the packed tests
compile equivalent consumers against emitted declarations. The negative fixtures use
`@ts-expect-error` so a future accidental export fails the fixture check.
No fixture imports `packages/core/src`.

Historical source-oriented subpaths are not in the `@emi/core` export map. The private
`@emi/core-migration` package is intentionally outside the public catalog and is not a supported
registry or source-distribution dependency.

## R1 provider-neutral protocol

`@emi/core/protocol` is now a real public subpath. Its public model is owned by core and imports
only Effect and Schema; it does not import React, XState, AI SDK, HealthFit, database, or platform
modules. Its schemas and mappers are grouped under `ChatProtocol` rather than exported as a flat
list of schema values and conversion functions.

R1 freezes these protocol decisions:

- `ChatMessage` has stable non-empty IDs, the roles `user`, `assistant`, `system`, and `tool`,
  provider-neutral text/reasoning/file/tool-call/tool-result parts, and an ISO UTC `createdAt`;
- attachments allow HTTP(S) or root-relative URLs and reject unsafe schemes before persisted data
  enters the domain;
- tool inputs, tool outputs, extension data, and error details use `Schema.Json`, never
  `Schema.Unknown`, at the normal JSON boundary;
- extension parts are independently schema-validated and namespaced, but are not silently added
  to the base message-part union;
- conversation, thread, memory, and chat-message HTTP DTOs use explicit camelCase fields and have
  one named DTO schema plus explicit domain mappers;
- generation events are `started`, `message-part`, `completed`, or `failed`; provider deltas stay
  outside the protocol; and
- `ModelProvider` consumes core messages and configuration and yields core generation events
  without AI SDK types.

DTO mapping returns `Effect<DomainValue, ProtocolDecodeError>`. Promise consumers derive their
boundary with `ChatProtocol.runPromise(effect)`; transport failures still use the structured
`TransportError` and `ErrorResponseDto` schemas. The public import and type fixtures exercise the
real package subpath as well as the compile-time consumer declarations.

The old `src/contract` and `src/chat/message-parts.ts` implementations are reachable only through
the private migration package. They are intentionally not imported by the new protocol.

## R2 actor-backed runtime facade

`@emi/core/runtime` now owns the existing XState actor graph behind `createChatRuntime`. The public
runtime exposes stable selectors, intent commands, `getState`, subscriptions, and idempotent
`start`/`stop`/`dispose` lifecycle methods. It does not expose actor refs, child snapshots, or raw
transport/session event envelopes.

`@emi/core/react` provides `ChatProvider`, `useChatRuntime`, `useChatSelector`, and
`useChatActions`. It uses React's external-store subscription model; durable application,
transport, browser, persistence, and UI state remains in actors. The canonical generic-web app now
uses this facade and keeps only DOM refs, scrolling, prompts, and rendering conversion in React.

The runtime accepts optional `storage.keys.settings` and `storage.keys.drafts` overrides. Defaults
are `emi-core-chat-settings` and `emi-core-chat-settings:draft`. Fetch, browser notifications,
storage, IDs, and the clock remain injected through `ChatRuntimeOptions`.

The runtime facade is protocol-native: its actor-owned session and transport state uses core
`ChatMessage` and `Attachment` values, and its native fetch/SSE transport does not load AI SDK.
Provider translation remains isolated in `adapters/ai-sdk`; no provider bridge is part of the
common runtime contract.

## Distribution modes

### Source mode

Source-copy consumers receive an owned copy of supported core source and tests. The generated
copy must retain its core revision marker, preserve the public subpath shape unless intentionally
forked, and compare local edits before an upstream refresh. R0 freezes the catalog and fixture
strategy; R7 owns the generated manifest and upgrade procedure.

### Registry mode

Registry mode now emits built ESM and declarations for every target subpath, points target
conditions at `dist`, and passes the clean tarball consumer. The package is non-private and carries
`PUBLISH.md` plus `source-manifest.json` in its published files. Historical application helpers
are outside the package in the private `@emi/core-migration` workspace package.

## R0-R8 decisions and final boundary

R0 freezes these choices for later packets:

- command methods are synchronous intent dispatch; streaming progress is observed through
  selectors and subscriptions;
- `ChatProvider` starts the runtime for the common React path, while `start`, `stop`, and
  `dispose` are idempotent for non-React hosts;
- `createChatServer` is Fetch-first, with Effect-native composition explicitly under
  `server/effect`;
- extension contributions use namespaced, schema-validated parts and an immutable registry;
- streaming uses normalized generation events; provider deltas remain inside adapters;
- public operations are grouped under domain classes or owned instances instead of flat export
  lists, with the React provider/hooks exception documented above;
- Effect is canonical for fallible protocol/server/adapter operations, and Promise helpers are
  derived at the boundary;
- `ChatServer` owns the generic server use-case boundary, `ChatServerEffect` is the explicit
  Effect construction surface, and `ChatFetchHandlers` is the derived Promise adapter;
- raw database/platform helpers remain in the private `@emi/core-migration` package until the
  application-specific server surfaces are retired;
- source regeneration refuses to silently overwrite locally changed files and reports a diff;
- styles remain an explicit `@emi/core/styles.css` import; and
- production SQL/platform adapters stay explicit while deterministic in-memory adapters belong
  in `testing`.

The R0 public-contract, R1 protocol, R2 runtime-facade, R3 server boundary, R4 AI SDK adapter,
R5 component tiers, R6 extension registry, R7 source/registry distribution, and R8 public-export
cleanup gates are closed for the target catalog. The private migration package is deliberately
kept outside the published core boundary while application-specific server/UI surfaces are
retired in their owning packages.

The remaining migration package is an explicit application boundary, not an alternate `@emi/core`
entrypoint. It is not included in registry/source distribution promises.
