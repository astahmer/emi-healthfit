# Architecture

High-level shape of Emi HealthFit. For setup and commands, see the root [README](../README.md). For end-user flows, see [USER_GUIDE.md](./USER_GUIDE.md). For product surface, see [features.md](./features.md).

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
| `packages/core` | Reusable layer via subpaths: `/contract`, `/server`, `/web`, `/cloudflare`, `/discord` |
| `packages/flavor-healthfit` | Fitness schemas, tools, prompt, analytics, and UI contributions |
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

Consumers choose the smallest supported subpath for their runtime:

- `@emi/core/chat` — provider-neutral chat schemas, streaming, and message protocols.
- `@emi/core/web` — headless actors, selectors, clients, and web primitives.
- `@emi/core/web/styled` — optional shadcn/Radix-style components and CSS.
- `@emi/core/server` and `@emi/core/cloudflare` — persistence ports and platform wiring.
- `@emi/core/contract` — generic contracts plus explicitly named domain compositions.

The package supports two consumption modes. Dependency mode imports these subpaths from a
workspace or registry package and supplies fetch, storage, browser, database, and execution
adapters explicitly. Source mode, used by `create-chat-app`, copies the package source and
tests into an editable app workspace in the spirit of shadcn; the copied source is then the
consumer's ownership boundary and can be forked without changing core's public contracts.
Registry distribution remains gated on a built packed-install consumer check; source mode is
the current fork-friendly path.

## Runtime composition

- **Alchemy** provisions and deploys stage-isolated Workers, D1, R2, and secrets. Alchemy is the deployment authority; Wrangler is for ops/diagnostics only.
- **Effect** owns request handling, typed failures, and database access on the Worker.
- **Better Auth** handles Google and anonymous sessions; `ALLOWED_EMAILS` is an application allowlist on top of identity.
- **Ownership** is per authenticated user id. Repositories scope reads and writes; personal data is not shared across accounts.
- **Chat generation** streams through the AI SDK, checkpoints UI chunks in D1, and resumes after refresh or disconnect via a stream replay endpoint. Long-term durable execution (Durable Objects) is planned separately.

## Data domains

Two domains share one D1 database but stay conceptually separate:

1. **Core chat** — users/sessions, conversations, messages, threads/branches, suggestions, notes, memories, generation checkpoints and diagnostics.
2. **HealthFit flavor** — daily activity, Apple Health workouts, sleep, body metrics, Hevy sessions/sets, sync cursors, Hevy connection/sync state, privacy preferences.

Raw Health and Hevy uploads land in R2 under a user-id prefix. Normalized rows in D1 power analytics, the Workouts page, and chat context.

## Frontend shape

- Static Vite build with TanStack Router; production assets are served from the Worker (SPA fallback).
- Chat runtime is XState-driven (conversation, composer, sidebar item, settings sync) with Vercel AI SDK transport.
- Local session cache (IndexedDB) supports offline browsing of known conversations.
- Generative UI (json-render) can render structured tool results as charts/cards inside the thread.

## Auth and privacy model

- Sign-in: Google (allowlisted) or anonymous guest sessions.
- Calendar and other Google scopes stay out of login; future calendar connect is incremental consent.
- Settings expose export/import of ingested fitness data, retention of raw uploads, and selective source deletion.
- Chat history, notes, and memories are separate from fitness export packages unless a future product choice expands that.

## Extension direction (core vs flavor)

HealthFit is one explicit product composition of the same reusable package: it adds schemas,
ingest, tools, prompts, fitness screens, and domain contracts to the generic chat baseline.
The package may ship both compositions because the subpath and composition contracts are the
real boundaries. Discord and Google Calendar are planned transports/integrations on that same
ownership model — not separate data silos. Keep domain additions named and opt-in for generic
consumers; do not make the generic runtime import HealthFit code.
