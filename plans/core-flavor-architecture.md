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
   core/health boundary without changing behavior.
3. Move schemas and shared types into `core-contract`; remove imports from frontend source into
   Worker implementation details.
4. Extract `core-server` repositories and services behind ports, keeping the existing Cloudflare
   implementations as adapters.
5. Extract `core-web` shell and accept typed navigation/page/tool-renderer contributions.
6. Move fitness prompt, tools, ingestion, analytics, and screens into `flavor-healthfit`.
7. Add generic composition roots and verify local development plus a free-tier deployment.
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
