# Architecture

High-level shape of Emi HealthFit. For setup and commands, see the root [README](../README.md). For end-user flows, see [USER_GUIDE.md](./USER_GUIDE.md). For product surface, see [features.md](./features.md). The detailed reusable-core contract is in [core-api.md](./core-api.md), with audit evidence in [core-audit.md](./core-audit.md).

## What it is

A personal gym assistant: Apple Health + Hevy data on Cloudflare, with a chat UI that answers training, recovery, and progress questions. One Worker serves the API and the built web app.

## System overview

```text
┌─────────────────┐     HTTPS      ┌──────────────────────────────────┐
│  Browser (Vite) │ ◄─────────────► │  Cloudflare Worker (Effect)      │
│  XState chat    │   /api/*, UI    │  Better Auth · HTTP API · tools  │
│  TanStack Router│                 │  AI SDK chat stream + resume     │
└─────────────────┘                 └───────────┬──────────────────────┘
                                                │
                          ┌─────────────────────┼─────────────────────┐
                          ▼                     ▼                     ▼
                     D1 (SQLite)              R2 bucket          LLM provider
                     owned rows               raw exports        (BYOK / gateway)
                     chat + fitness           per-user prefix
```

## Monorepo layout

| Area | Role |
| --- | --- |
| `apps/api` | Cloudflare Worker: auth, chat, ingest, fitness APIs, Hevy sync, tools |
| `apps/chat` | Vite SPA: chat shell, data pages, settings; built assets served by the Worker |
| `packages/core` | Reusable target package via curated protocol, runtime, React, component, server, adapter, extension, testing, and advanced subpaths |
| `packages/flavor-healthfit` | Fitness schemas, tools, prompt, analytics, contracts, and UI contributions |
| `packages/create-chat-app` | Scaffolder for thin composition roots |
| `plans/` | Active product plans (not shipped docs) |
| `docs/` | Product and architecture documentation |
| `ADR/` | Accepted design decisions |

## Core package and distribution model

`@emi/core` is intentionally one broad, go-to library for chat and agent applications. Its
mixed layers are a feature: actor and machine logic, contracts, headless web primitives,
optional styled components, persistence/server logic, and platform adapters live together
behind capability subpaths. Layer purity is not the boundary; imports from an app or a
product flavor are.

Consumers choose the smallest supported target subpath for their runtime:

- `@emi/core/protocol` — provider-neutral messages, parts, schemas, and mappers.
- `@emi/core/chat` and `/contract` — explicitly named generic chat and HTTP domain owners for
  applications that need the broader server/client contract; these are not required by the
  common React path.
- `@emi/core/runtime` and `@emi/core/react` — actor-backed state facade and React view binding.
- `@emi/core/components` and `@emi/core/components/styled` — headless primitives and recipes.
- `@emi/core/web` — generic browser views, contribution context, and thread presentation without
  raw actor access.
- `@emi/core/server`, `/server/effect`, and `/server/fetch` — generic Effect-first server composition.
- `@emi/core/server/database` — explicit advanced persistence and replay implementations.
- `@emi/core/adapters/ai-sdk`, `/adapters/cloudflare`, and `/cloudflare` — explicit
  provider/platform bindings; the latter includes Cloudflare route and auth composition.
- `@emi/core/discord` — explicit Discord transport contracts.
- `@emi/core/extensions` and `/testing` — namespaced product extensions and deterministic test helpers.
- `@emi/core/advanced/xstate` — deliberate advanced actor access.
- `@emi/flavor-healthfit/contract` — the HealthFit product composition, extending `CoreApi` with fitness and Hevy groups.

The flavor root exports one `HealthFit` domain owner with scoped `app`, `chat`, `data`, `ingest`,
`storage`, `hevy`, and `tools` members. Product consumers discover HealthFit operations through
that owner instead of importing a flat collection of unrelated functions and tables.

Core follows the same rule: `Chat`, `CoreApi`, `Discord`, `Cloudflare`, `CloudflareDatabase`,
and `ServerDatabase` are named domain owners with scoped members. Generic chat message rendering
belongs in core; the HealthFit app supplies only its memory, model, settings, and GenUI composition
around that view. Individually exported React view primitives remain an intentional exception when
each component is independently consumable; they are not a miscellaneous utility barrel.

The package supports two consumption modes. Dependency mode imports these subpaths from a
workspace or registry package and supplies fetch, storage, browser, database, and execution
adapters explicitly. Source mode, used by `create-chat-app`, copies the package source and
tests into an editable app workspace in the spirit of shadcn; the copied source is then the
consumer's ownership boundary and can be forked without changing core's public contracts.
Registry distribution emits built ESM/declarations and passes a clean packed-install consumer;
source mode is the fork-friendly path generated from the same catalog.

## Runtime composition

- **Alchemy** provisions and deploys stage-isolated Workers, D1, R2, and secrets. Alchemy is the deployment authority; Wrangler is for ops/diagnostics only.
- **Effect** owns request handling, typed failures, and database access on the Worker.
- **Persistence capabilities** are injected: advanced database clients carry explicit clock, ID,
  and random-byte providers; platform edges construct those providers, while database operations
  remain deterministic under tests.
- **Better Auth** handles Google and anonymous sessions; `ALLOWED_EMAILS` is an application allowlist on top of identity.
- **Ownership** is per authenticated user id. Repositories scope reads and writes; personal data is not shared across accounts.
- **Chat generation** uses the provider-neutral core protocol; the AI SDK adapter checkpoints
  generation events in D1 and resumes after refresh or disconnect via a stream replay endpoint.

## Data domains

Two domains share one D1 database but stay conceptually separate:

1. **Core chat** — users/sessions, conversations, messages, threads/branches, suggestions, notes, memories, generation checkpoints and diagnostics.
2. **HealthFit flavor** — daily activity, Apple Health workouts, sleep, body metrics, Hevy sessions/sets, sync cursors, Hevy connection/sync state, privacy preferences.

Raw Health and Hevy uploads land in R2 under a user-id prefix. Normalized rows in D1 power analytics, the Workouts page, and chat context.

## Frontend shape

- Static Vite build with TanStack Router; production assets are served from the Worker (SPA fallback).
- Chat runtime is XState-driven (conversation, composer, sidebar item, settings sync) with a
  provider-neutral protocol transport; AI SDK translation belongs in the explicit adapter.
- Local session cache (IndexedDB) supports offline browsing of known conversations.
- Generative UI (json-render) can render structured tool results as charts/cards inside the thread.

## Auth and privacy model

- Sign-in: Google (allowlisted) or anonymous guest sessions.
- Calendar and other Google scopes stay out of login; future calendar connect is incremental consent.
- Settings expose export/import of ingested fitness data, retention of raw uploads, and selective source deletion.
- Chat history, notes, and memories are separate from fitness export packages unless a future product choice expands that.

## Extension direction (core vs flavor)

HealthFit is one explicit product composition over the reusable core: the flavor package adds
schemas, ingest, tools, prompts, fitness screens, and domain contracts to the generic chat
baseline. Keep domain additions in named flavor packages and opt-in for product consumers;
the generic runtime and target `@emi/core` entrypoints must not import or export HealthFit code.
Discord and Google Calendar are planned transports/integrations on that same ownership model,
not separate data silos.
