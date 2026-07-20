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
| `packages/api-contract` | Shared wire schemas for the typed HTTP API |
| `plans/` | Active product plans (not shipped docs) |
| `docs/` | Product and architecture documentation |
| `ADR/` | Accepted design decisions |

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

The long-term split (see `plans/core-flavor-architecture.md`) keeps a reusable chat core (conversations, branches, generation, memory, notes, auth, settings UI) and registers HealthFit as a compile-time flavor (schemas, ingest, tools, prompts, fitness screens). Discord and Google Calendar are planned transports/integrations on that same ownership model — not separate data silos.
