# Features

What Emi HealthFit offers today, plus status of reusable chat-platform work. How-to steps live in [USER_GUIDE.md](./USER_GUIDE.md); system shape in [architecture.md](./architecture.md); extraction sequence lives in [core-chat-platform.md](../plans/core-chat-platform.md).

## Core chat platform status

This repository has a substantial ChatGPT-like product implementation, but it is not yet a complete reusable core. Today, `@emi/core` supplies contracts, provider streaming, durable generation/replay, generic Cloudflare route factories, conversation persistence primitives, markdown/attachment helpers, a basic shell, and extension contracts. `apps/generic-web` and `create-chat-app` now provide interactive BYOK chat with durable history/actions, stream reconnection, queued follow-ups, and attachments; most advanced chat behavior remains in the HealthFit web and API applications.

The target is a full generic default chat app produced by `create-chat-app`, with source owned by the generated project, plus optional direct `@emi/core` composition. See the plan for scope and delivery phases.

| Capability                          |        HealthFit today |                                          Reusable core today |     Generic scaffold target |
| ----------------------------------- | ---------------------: | -----------------------------------------------------------: | --------------------------: |
| Composer, attachments, model choice |                    Yes |         Generic composer, local settings, inline attachments |               Core baseline |
| Streaming, durable chunks, resume   |                    Yes |                     Generic web/Worker and generated starter |               Core baseline |
| Conversations, search, actions      |                    Yes | Generic history, search, rename, pin, archive, clone, delete |               Core baseline |
| Branches, compact, start fresh      |                    Yes |              Generic branch routes and contract/tree helpers |               Core baseline |
| Queue and force-send                |                    Yes |                             Generic web queue and force-send |               Core baseline |
| Suggestions and auto title/summary  |                    Yes |                Generic auto-title, configurable prompt/model |               Core baseline |
| Memory extraction and management    |                    Yes |                                            Storage/contracts |               Core baseline |
| Dynamic component foundation        | Yes, HealthFit widgets |                                        Contribution registry | Core baseline, generic only |
| Settings, theme, releases           |                    Yes |                                                           No |               Core baseline |
| PWA/offline                         |                Partial |                                                           No |     Progressive enhancement |
| Health/Hevy data and coaching       |                    Yes |                                                           No |                 Flavor-only |

## Chat

- Streaming assistant replies with configurable GPT-compatible providers (BYOK).
- Resumable generations: refresh or reconnect without losing an in-flight answer.
- Conversation history: create, rename, pin, archive, clone, delete, search.
- Branches / side threads from any persisted message; fork, focus, summarize, discard, restore.
- Edit and regenerate user turns; stop mid-stream.
- Attachments (images) in the composer.
- Follow-up suggestions after a turn.
- Markdown copy, download, and share affordances.
- Coach / web / model toggles in the composer where enabled.
- Tool-backed answers (fitness analytics, conversation ops, optional generative UI components).

## Data ingest

- Upload Apple Health exports (HealthExportKit JSON) and Hevy CSV from the Upload page.
- Upsert into D1; keep raw blobs in R2 according to privacy settings.
- iPhone Shortcut path for phone-side upload (see user guide).
- Settings: export/import a versioned JSON package of ingested fitness data; preview duplicate vs new counts before import.

## Hevy live sync

- Connect a Hevy API key from Settings (encrypted server-side; never returned to the browser).
- Initial import plus incremental sync from Hevy workout events.
- Manual Sync, connection status, disconnect, and remove synced data.
- D1 remains the fast read model for Workouts, trends, and chat context.

## Fitness surfaces

- **Workouts** — browse and filter Hevy sessions and set detail.
- **Trends** — activity, sleep, body, training load, and exercise progress charts.
- **Recovery** — recovery-oriented summary used by chat and the recovery API.

## Notes and memory

- **Notes** — personal gym journal entries; optional inclusion in assistant context.
- **Memory** — saved snippets and extracted memories from conversations; searchable and deletable.

## Account and settings

- Google sign-in for allowlisted emails; anonymous guest sessions for try-before-commit flows.
- Theme toggle; provider/model settings.
- Privacy controls: raw-upload retention and selective deletion of Apple Health or Hevy sources.
- Session diagnostics download for troubleshooting a stuck or odd conversation.

## Planned (not productized yet)

Documented in `plans/` — not available as shipped features:

- **Google Calendar** — separate calendar connect, availability for coaching, optional workout event write-back.
- **Discord bot** — same ownership-scoped assistant over Discord, without exposing shared legacy data.
- **Core / flavor extraction** — reusable chat core packages with HealthFit as one flavor.
