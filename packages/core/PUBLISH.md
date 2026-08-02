# `@emi/core` R0 contract, R1 protocol, R2 runtime facade, R3 server boundary, and distribution

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
| `@emi/core/api`                 | generic HTTP DTOs and `createCoreApiClient`                                    | no product routes or persistence details                     |
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

The matrix is a contract for later built-package dependency isolation. R7 must turn these
intentions into emitted artifacts and clean-install checks.

## API organization and Effect-first rule

Public entrypoints should expose a small number of domain owners. Stateless operations belong on
an explicitly named class with static methods; stateful operations belong on an instance that owns
its dependencies and lifecycle. Avoid flat files that export a long list of related functions or
mutable values. Named TypeScript types may remain individually exported when consumers need them
for annotations. React keeps a deliberately small exception for separately consumable provider and
hook primitives because that is the native composition model and the frozen common-consumer path.

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

The old database, auth, and AI-SDK-shaped server helpers are quarantined under the internal
migration path `@emi/core/server/legacy`; it is not listed in `emi.publicApi`, not a target name,
and must not be used by generic consumers. Existing Cloudflare and application workers use this
bridge while their platform adapters move to explicit ports. The primary server barrel has no
wildcard exports and does not import D1, Drizzle, Kysely, Cloudflare, or AI SDK types.

## Fixture strategy

R0 has four kinds of compile-time evidence under `test/fixtures`:

- `consumers/` contains literal imports for the common path and every target capability,
  including the explicit XState and Effect paths;
- `contracts/` is a small R0-only declaration layer that expresses the target type shapes before
  R1–R6 create the implementation modules;
- `packed/` compiles real currently available package subpaths such as `chat`, `contract`,
  `server`, `web`, `cloudflare`, and `discord`; and
- `rewrite-gates/` contains expected compile-time rejections for internal `src` imports,
  HealthFit APIs, AI SDK message types in protocol, and raw database/platform types in generic
  protocol/server contracts.

`test/public-api/fixtures.test.ts` runs both the contract fixture compiler and the real current
subpath compiler. The target consumers are deliberately named rewrite gates: their temporary
`@ts-ignore` annotations disappear when the corresponding R1–R6 public modules exist. The
negative fixtures use `@ts-expect-error` so a future accidental export fails the fixture check.
No fixture imports `packages/core/src`.

The current source-oriented subpaths remain in the export map as migration bridges for the
existing generic app and worker. They are listed as `legacySourceEntrypoints` in the R0 catalog;
they are not target names to preserve. R8 removes them after the generic consumers move to the
catalog above.

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

The old `src/contract` and `src/chat/message-parts.ts` surfaces remain migration bridges for the
current worker and app. They are intentionally not imported by the new protocol; R3 and R4 own
their server-contract and provider-adapter migrations respectively.

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

R2 intentionally leaves two migration bridges. The facade currently adapts the existing AI SDK
transport/session actors internally, and generic-web temporarily adapts protocol messages back to
the existing styled web renderer. R4 moves provider translation into `adapters/ai-sdk`; R5
rebuilds the React/component tiers. Neither bridge is part of the public runtime contract.

## Distribution modes

### Source mode

Source-copy consumers receive an owned copy of supported core source and tests. The generated
copy must retain its core revision marker, preserve the public subpath shape unless intentionally
forked, and compare local edits before an upstream refresh. R0 freezes the catalog and fixture
strategy; R7 owns the generated manifest and upgrade procedure.

### Registry mode

Registry mode is not publish-ready in R0. Before changing `private` to `false`, R7 must provide:

- built ESM and declaration output for every target subpath;
- conditional exports that point at emitted artifacts rather than workspace TypeScript;
- isolated runtime, peer, and optional dependency installation per matrix tier;
- a packed clean-consumer import and typecheck for the target fixtures; and
- package README, license, version, and provenance metadata.

## R0-R3 decisions and remaining gates

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
- raw database/platform helpers are temporarily isolated behind the non-catalog
  `server/legacy` migration path while Cloudflare ports are extracted;
- source regeneration refuses to silently overwrite locally changed files and reports a diff;
- styles remain an explicit `@emi/core/styles.css` import; and
- production SQL/platform adapters stay explicit while deterministic in-memory adapters belong
  in `testing`.

The R0 public-contract, R1 protocol, R2 runtime-facade, and generic R3 server-boundary gates are
closed for the new port/use-case/Fetch surface. The legacy Cloudflare route and its D1 repository
mapping remain an explicit R3 migration bridge; they must be completed before the final
distribution gate. Remaining implementation gates are R4 for the AI SDK adapter, R5 for
React/components/styles, R6 for extensions, and R7 for source and registry distribution.
These are implementation dependencies, not alternate public names.

R2 leaves the legacy transport/session bridge and generic-web styled bridge. R3 leaves only the
explicit Cloudflare/D1 migration bridge described above. R4 owns the AI SDK adapter; R5 consumes
the completed protocol and server fixtures.
