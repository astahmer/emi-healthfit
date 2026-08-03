# Features

What Emi HealthFit offers today, plus the reusable chat-platform baseline. How-to steps live in
[USER_GUIDE.md](./USER_GUIDE.md); system shape in [architecture.md](./architecture.md); current core
contract in [core-api.md](./core-api.md); extension and deployment details live in
[extension-guide.md](./extension-guide.md) and [deployment.md](./deployment.md).

## Core chat platform status

`@emi/core` is the repository's go-to reusable chat/agent library. It intentionally contains
the actor runtime, contracts, provider streaming, durable generation/replay, generic
Cloudflare route factories, conversation persistence primitives, markdown/attachment helpers,
headless web primitives, and optional styled web components. These mixed layers are kept in
one package and selected through subpath exports; the reusable boundary is explicit adapters
and imports, not a forced package split.

`apps/generic-web` and `create-chat-app` provide interactive BYOK chat with durable
history/actions, stream reconnection, queued follow-ups, and attachments. HealthFit remains a
domain composition with fitness-specific tools, prompts, screens, and contracts.

The generic baseline is verified by the `apps/generic-web` browser suite and the generated-app
acceptance fixture. The focused matrix includes durable conversation actions, memory creation and
deletion, branches/minimap, temporary chats, queue/force-send, attachment and settings validation,
offline draft state, reconnect/stop/retry, theme, releases, and WebMCP safety.

There are two supported development shapes. Dependency mode reuses `@emi/core` through its
target subpaths without a fork. Source mode, the default for `create-chat-app`, copies core
source and tests into an editable workspace in a shadcn-like ownership model so an app can fork
and customize the implementation. Registry mode emits built artifacts and passes the packed
clean-consumer checks documented in `packages/core/PUBLISH.md`.
Generic HTTP API consumers use `CoreApiClient` from `@emi/core/api` and the Effect-first server
surface from `@emi/core/server/effect`.
The HealthFit product imports `HealthFitApi` from `@emi/flavor-healthfit/contract`, where the
fitness and Hevy groups extend that generic baseline. HealthFit-specific contracts do not live
in `@emi/core`.

| Capability                          |        HealthFit today |                                          Reusable core today |     Generic scaffold target |
| ----------------------------------- | ---------------------: | -----------------------------------------------------------: | --------------------------: |
| Composer, attachments, model choice |                    Yes |         Generic composer, local settings, inline attachments |               Core baseline |
| Streaming, durable chunks, resume   |                    Yes |                     Generic web/Worker and generated starter |               Core baseline |
| Conversations, search, actions      |                    Yes | Generic history, search, rename, pin, archive, clone, delete |               Core baseline |
| Branches, compact, start fresh      |                    Yes | Generic branches plus compacted-summary conversation handoff |               Core baseline |
| Queue and force-send                |                    Yes |                             Generic web queue and force-send |               Core baseline |
| Suggestions and auto title/summary  |                    Yes |                Generic auto-title, configurable prompt/model |               Core baseline |
| Memory extraction and management    |                    Yes | Auto-extraction, compact summary context, searchable manager |               Core baseline |
| Dynamic component foundation        | Yes, HealthFit widgets |                                        Contribution registry | Core baseline, generic only |
| Settings, theme, releases           |                    Yes |         Generic persisted theme and configured release notes |               Core baseline |
| PWA/offline                         |                Partial |            Installable shell, offline fallback, local drafts |     Progressive enhancement |
| Health/Hevy data and coaching       |                    Yes |                                                           No |                 Flavor-only |

## Chat

- Streaming assistant replies with configurable GPT-compatible providers (BYOK).
- Resumable generations: refresh or reconnect without losing an in-flight answer.
- Conversation history: create, rename, pin, archive, clone, delete, search.
- Compact a durable conversation into a fresh chat seeded with its model-generated summary.
- Optional long-term memory: automatically extract durable details from saved replies, summarize them for later context, and search, add, or delete them in the sidebar.
- Progressive web app shell caches static UI only; APIs are never cached, and drafts survive offline periods locally.
- Branches / side threads from any persisted message; fork, focus, summarize, discard, restore.
- Message minimap: user-message previews jump to their turns; top, previous, and bottom controls navigate long chats.
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
- **Discord bot** — same ownership-scoped assistant over Discord, without exposing another user's data.
