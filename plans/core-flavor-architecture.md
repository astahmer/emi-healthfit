# Core and flavor architecture

## Objective

Extract the reusable ChatGPT-like product without creating two copies that must be synchronized.
The reusable core owns conversations, messages, branches, resumable generation, suggestions,
memory, notes, auth, settings, and shared UI. Emi HealthFit becomes one compile-time flavor that adds
fitness data, ingestion, tools, prompts, routes, and screens. A Discord flavor can reuse the server
core without depending on the web shell.

## Recommendation

Keep one upstream monorepo while extracting. Publish versioned core packages and a small project
generator from it. A standalone template repository should be generated from released packages and
tested as a deployment fixture; it must not contain copied core source.

Use compile-time capability registration rather than a dynamic runtime plugin loader. TypeScript
composition preserves full power and tree-shaking without inventing plugin lifecycle, sandboxing,
version negotiation, or a lowest-common-denominator API. Runtime extensions can be added later only
where there is a demonstrated need.

```text
apps/
  healthfit-web/          Next.js composition root
  healthfit-worker/       Cloudflare composition root
  generic-web/            deployable generic chat app and template fixture
  generic-worker/
packages/
  core-contract/          schemas and API contracts with no platform imports
  core-server/            auth, conversations, branches, generation, memory, notes
  core-web/               chat shell, composer, sidebar, settings, core pages
  platform-cloudflare/    D1, R2, Durable Object, Worker, and Alchemy adapters
  flavor-healthfit/       health schemas, ingestion, tools, prompt, API and UI extensions
  transport-discord/      Discord event and response adapter
  create-chat-app/        scaffolder for a thin self-hostable composition root
```

## Composition contract

Define one `AppDefinition` assembled by each app entry point. It contains values, not framework
magic:

- identity: app name, description, icon, and theme defaults;
- prompt contributors: ordered system-prompt fragments;
- tools: schemas, descriptions, handlers, and required capabilities;
- HTTP modules: route registration functions with explicit public/authenticated policy;
- navigation and pages: typed entries rendered by the web shell;
- data modules: namespaced migrations and repository layers;
- optional transports: web chat, Discord, or another event source.

Core packages expose narrow extension points. Flavors may import core contracts, but core packages
must never import a flavor. Platform packages implement ports declared by core (`ConversationStore`,
`GenerationCoordinator`, `BlobStore`, `Identity`, and `ModelProvider`).

## Data boundaries

Core owns users, sessions, conversations, messages, threads, memories, notes, suggestions,
generation state, and rate-limit state. HealthFit owns activity, workouts, sleep, body metrics,
imports, exports, and fitness analytics.

Every repository is constructed with an authenticated `RequestContext` containing `userId` and a
request id. Ownership is applied inside repositories, not remembered by route handlers. Child rows
derive ownership through an owned root and all write queries verify the parent in the same
statement. Raw SQL is not a core capability and must not be exposed in a multi-user deployment.

Core and flavor migrations use separate numeric namespaces and a shared migration manifest so an
app can deterministically compose them. No flavor migration changes a core-owned table directly;
core exposes extension tables keyed by core ids when needed.

## Cloudflare deployment

The generic free-tier target uses one Worker, D1, and a SQLite-backed Durable Object for each active
generation. R2 and AI Gateway remain optional capabilities. Durable Objects coordinate one
generation per conversation and allow reconnecting clients without relying on a request-scoped
`waitUntil` task.

Alchemy remains the composition layer. Secrets are `Config.redacted` inputs bound during deploy;
plain configuration uses non-redacted config. Composition roots declare only resources required by
their enabled capabilities.

## Template workflow

`pnpm create chat-app` should ask for app name, deployment target, auth provider, model provider,
and optional capabilities. It generates only composition files, branding, environment examples,
and deployment configuration. Generated apps depend on released core packages, so upgrades are a
normal dependency update rather than a manual port.

The upstream repository continuously generates a fixture and deploys/tests it. A public template
repository may mirror that generated fixture for GitHub's “Use this template” experience, but its
README states that application logic comes from versioned packages.

## Extraction phases

1. Finish per-user ownership and replace the raw database tool with owned domain queries. **DONE**
   (parent-verified child writes, RequestContext in auth gate, insert isolation tests; raw SQL tool gone).
2. Split current Worker into route modules and current database file into repositories at the
   core/health boundary without changing behavior. **DONE**
   (`apps/api/src/{core,healthfit,platform}/`, schema split, composition injects flavor hooks/tools;
   boundary test forbids `core → healthfit`).
3. Move schemas and shared types into `core-contract`; remove imports from frontend source into
   Worker implementation details. **DONE**
   (`packages/core-contract` renamed from `api-contract`; chat forbids `apps/api/src` imports;
   contract encode/platform-isolation tests).
4. Extract `core-server` repositories and services behind ports, keeping the existing Cloudflare
   implementations as adapters. **DONE**
   (`@emi/core-server` with RequestContext-bound `ConversationStore`; `@emi/platform-cloudflare`
   D1 client; list/create handlers wired; in-memory store ownership test).
5. Extract `core-web` shell and accept typed navigation/page/tool-renderer contributions. **DONE**
   (`@emi/core-web` with CoreWebProvider + contribution slots; conversation helpers/attachments
   moved; HealthFit registers nav/tool renderers; thread.tsx deferred to deeper shell move).
6. Move fitness prompt, tools, ingestion, analytics, and screens into `flavor-healthfit`. **DONE**
   (`packages/flavor-healthfit` with `fitnessCoachV1`, the fitness/thread `tools`+`executeTool`
   toolkit, `db/fitness.ts` analytics queries, the healthfit Drizzle schema, pure health/Hevy ingest
   parsers, `healthFitWebContributions`, and the workout/exercise/recovery tool-renderer components;
   `@emi/core-server` gained a moved `db/memories.ts` so the toolkit's `search_memories` tool no
   longer reaches into `apps/api`; old `apps/api`/`apps/chat` paths are thin re-export barrels;
   `apps/api` and `apps/chat` depend on and import from `@emi/flavor-healthfit`; boundary tests on
   `core-server`, `core-web`, and `core-contract` forbid importing `flavor-healthfit`/`healthfit`.
   Deferred: Hevy OAuth/sync integrations, `db/ingested-data.ts`, `ingest/data-transfer.ts`,
   `http/data.ts`, `http/hevy.ts`, `routes/data.ts`, and the `/upload`, `/workouts`, `/summary`
   screens stay in the apps for now since they are Worker/Router-runtime coupled; the `render_component`
   gen-ui catalog/registry also stays in `apps/chat` and continues to import the three moved tool
   renderers through the `tool-result-content.tsx` barrel. The package exposes two entry points —
   `@emi/flavor-healthfit` (server-safe: prompt, tools, ingest, analytics) and `@emi/flavor-healthfit/web`
   (React contributions and tool renderers) — so `apps/api`'s non-JSX `tsc` config never resolves `.tsx`
   files through the barrel. Kysely's `Transaction`/`withRecursive` typings make `QueryDatabaseClient<T>`
   structurally invariant in `T`, so a wider app `DatabaseSchema` client can't be passed directly to
   these narrower composed-schema functions (a pre-existing limitation already visible on
   `ConversationDatabaseSchema` call sites before this phase); call sites narrow explicitly via a
   documented `narrowQueryDatabaseClient`/`narrow` cast helper in `apps/api/src/platform/db/client.ts`
   and `packages/flavor-healthfit/src/tools/api.ts` rather than widening every downstream signature.)
7. Add generic composition roots and verify local development plus a free-tier deployment. **DONE**
   (`AppDefinition`/`mergeAppDefinitions`/`composeSystemPrompt`/`coreAppDefinition` added to
   `@emi/core-server` — identity, ordered prompt contributors, and a name-keyed tool list merged
   left to right with later definitions overriding a shared name's body while keeping its earliest
   position; unit tests cover ordering and merge/override semantics. `packages/flavor-healthfit`
   assembles `healthFitAppDefinition = mergeAppDefinitions(coreAppDefinition, {identity, one
   `fitness-coach-v1` prompt contributor, tools})`; `apps/api/src/api.worker.ts`'s `/api/chat` route
   now derives `coachSystemPrompt` via `composeSystemPrompt(healthFitAppDefinition.promptContributors)`
   and `tools` from `healthFitAppDefinition.tools`, replacing the direct `fitnessCoachV1`/`tools`
   imports so the merged definition is the one source of truth the chat-lifecycle hooks consume.
   Added `apps/generic-worker` (Alchemy Cloudflare Worker composing only `@emi/core-server` +
   `@emi/platform-cloudflare`: its own D1 database/migrations for the conversation tables, a
   `/api/health` route serving `coreAppDefinition.identity`, and `/api/conversations` list/create
   routes built on `makeConversationStore`, gated by a documented demo-only `x-demo-user-id` header
   since real session auth still lives in `apps/api/src/core/auth` and was not extracted this phase)
   and `apps/generic-web` (Vite + React app depending only on `@emi/core-web` + `@emi/core-contract`,
   mounting `CoreWebProvider` with minimal nav contributions and one smoke page). Both new apps ship
   a boundary test forbidding `flavor-healthfit`/`healthfit`/`apps/api`/`apps/chat` references in
   source or `package.json`, plus their own unit/smoke tests; `apps/api` and `apps/chat` keep their
   existing names and deploy scripts unchanged (renaming was judged unnecessary risk for the
   generic-root goal). `alchemy deploy --dry-run` (`pnpm --filter @emi/generic-worker dry`) succeeds
   against the existing Cloudflare account with a clean create-plan. Deferred: no shared package
   yet hosts the core HTTP route/auth composition used by `apps/api`'s Effect router, so
   `generic-worker` re-implements a minimal router directly instead of reusing `apps/api/src/core/*`
   route modules; extracting that HTTP composition layer (and real session auth) into a package is
   left for a later phase before `generic-worker` can be considered feature-complete.)
8. Add `create-chat-app`, package releases, generated-template CI, and an upgrade test.
9. Add Discord transport only after generic web and HealthFit both consume the same released core.

## Guardrails

- No source copying between template and HealthFit.
- No dynamic plugin loading in the first extraction.
- No platform types in core contracts.
- No raw SQL tool in multi-user apps.
- No generic abstraction until at least core plus HealthFit need it; Discord validates transport
  boundaries later.
- Each extraction step keeps the existing app deployable and includes contract/isolation tests.
