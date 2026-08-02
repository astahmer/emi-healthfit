# `@emi/core` R0 contract and distribution

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
| `@emi/core/extensions`          | `defineChatExtension` and collision-checked composition                        | product domains remain external packages                     |
| `@emi/core/testing`             | deterministic dependencies, in-memory repositories, and actor harnesses        | test-only helpers, not production state                      |
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

- `protocol` and `api` may use Effect schemas internally but never expose Effect services;
- `runtime` and `advanced/xstate` own XState; React is not a runtime dependency;
- `react` and `components` require React only through their declared peer boundaries;
- `components/styled` keeps visual helpers optional and does not make styling mandatory;
- `server` and `server/fetch` keep generic server contracts free of database/platform packages;
- `adapters/ai-sdk` is the only AI SDK boundary;
- `adapters/cloudflare` is the only Cloudflare/database boundary; and
- `testing` owns deterministic test helpers without becoming a production adapter.

The matrix is a contract for later built-package dependency isolation. R7 must turn these
intentions into emitted artifacts and clean-install checks.

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

## R0 decisions and remaining gates

R0 freezes these choices for later packets:

- command methods are synchronous intent dispatch; streaming progress is observed through
  selectors and subscriptions;
- `ChatProvider` starts the runtime for the common React path, while `start`, `stop`, and
  `dispose` are idempotent for non-React hosts;
- `createChatServer` is Fetch-first, with Effect-native composition explicitly under
  `server/effect`;
- extension contributions use namespaced, schema-validated parts and an immutable registry;
- streaming uses normalized generation events; provider deltas remain inside adapters;
- source regeneration refuses to silently overwrite locally changed files and reports a diff;
- styles remain an explicit `@emi/core/styles.css` import; and
- production SQL/platform adapters stay explicit while deterministic in-memory adapters belong
  in `testing`.

The unresolved R0 gates are implementation dependencies, not alternate public names: R1 must
build protocol schemas and mappers, R2 must build the runtime facade, R3 must curate server
contracts, R4 must isolate AI SDK, R5 must create React/components/styles, R6 must create
extensions, and R7 must make source and registry distribution real. R0 does not begin any of
those packets.
