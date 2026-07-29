# Features

What Emi HealthFit offers today. How-to steps live in [USER_GUIDE.md](./USER_GUIDE.md); system shape in [architecture.md](./architecture.md).

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
