# Google Calendar integration plan

## Context

- The Next.js chat app proxies `/api/*` to one Effect-based Cloudflare Worker.
- D1 already stores conversations, health/workout data, notes, memories, generations, and privacy
  preferences.
- Google sign-in is planned but not implemented. Calendar access must be incremental consent, not a
  hidden expansion of the login scope.
- The first useful outcome is schedule-aware coaching; writing workout events can follow after the
  read path is trusted.

## Goal

Let an authenticated user connect selected Google calendars, use upcoming availability in chat
context, and optionally publish planned workouts without exposing refresh tokens to the browser.

## Product phases

1. **Connect and read:** choose calendars, show connection health, and list the next 14 days.
2. **Coach context:** expose a bounded `get_calendar_availability` tool that returns busy windows and
   workout-like events, not an unbounded calendar dump.
3. **Plan preview:** let the assistant propose dated workout events in a review screen.
4. **Write after confirmation:** create or update only events managed by Emi HealthFit.
5. **Background freshness:** add incremental sync or push notifications only if on-demand refresh is
   perceptibly slow or unreliable.

## Authorization

- Reuse the Google OAuth client from the auth plan, but request Calendar permission through a
  separate “Connect Google Calendar” action.
- Begin with `calendar.readonly`. Add `calendar.events` only when the user enables event publishing.
- Use the server-side authorization-code flow with `access_type=offline`, a short-lived signed state
  value, PKCE, and an exact callback URI.
- Store the refresh token encrypted in D1. Keep the encryption key in a Worker secret. Never return
  refresh or access tokens to the frontend or logs.
- Preserve an existing refresh token when a later token response omits it. Support explicit
  disconnect and Google token revocation.

## Data model

- `calendar_connections`: user id, Google subject, encrypted refresh token, granted scopes,
  connection status, last error, timestamps.
- `calendar_selections`: connection id, calendar id, display name, timezone, enabled flag,
  read/write role.
- `calendar_sync_state`: calendar id, sync token, last successful sync, last full sync.
- `calendar_events`: Google event id, calendar id, etag, status, start/end, recurrence metadata,
  normalized title, busy flag, updated timestamp.
- `calendar_event_links`: local workout-plan id, Google event id, calendar id, last exported hash.

User ownership becomes mandatory once auth lands: every connection and cached event row must carry
or derive a user id. Do not introduce globally shared Calendar rows in the current single-user
schema.

## API and Effect services

- `GET /api/integrations/google-calendar/status`
- `POST /api/integrations/google-calendar/connect`
- `GET /api/integrations/google-calendar/callback`
- `GET/PATCH /api/integrations/google-calendar/calendars`
- `POST /api/integrations/google-calendar/sync`
- `DELETE /api/integrations/google-calendar`
- `POST /api/integrations/google-calendar/events/preview`
- `POST/PATCH/DELETE /api/integrations/google-calendar/events/:linkId`

Create a `GoogleCalendar` Effect service around explicit HTTP requests. Use `Effect.fn` for service
operations, qualified schema errors, redacted token values, spans, and `Effect.log*`. Validate every
Google response and frontend request with Effect Schema. Centralize refresh-token exchange and one
retry after a `401`.

## Synchronization strategy

- MVP fetches selected calendars on connect, explicit refresh, and before a calendar tool call when
  the cache is stale (for example, older than five minutes).
- Use `events.list` with a bounded time range, `singleEvents=true`, and explicit pagination.
- Persist `nextSyncToken` after a full sync. Later calls use `syncToken`; a rejected/expired token
  triggers a clean bounded full sync.
- Treat cancelled events as deletions. Store UTC instants plus the source timezone and handle
  all-day events separately.
- Do not add Calendar push channels initially. They require renewable channels and a public webhook;
  the complexity is not justified until usage proves on-demand sync insufficient.

## Chat and UI behavior

- Settings gets a Calendar card with connect/disconnect, scopes, selected calendars, last sync, and
  a manual refresh action.
- The chat tool returns availability summaries and event references only for the requested window.
- Proposed writes always render a preview with title, date, duration, calendar, timezone, recurrence,
  and conflict warnings. A user confirmation is required before mutation.
- Managed events include private extended properties identifying Emi HealthFit. Never update or
  delete unrelated events.
- A disconnected or expired connection degrades gracefully: chat explains that Calendar is
  unavailable and links to Settings rather than failing the whole generation.

## Privacy and reliability

- Calendar data joins the existing export/delete controls: export connection metadata and cached
  normalized events, but never tokens; selective deletion removes tokens, cache, sync state, and
  managed-event links.
- Default cache horizon is 30 days past through 90 days future. Add a separate retention control if
  longer history becomes useful.
- Never send descriptions, attendees, conferencing links, or private extended properties to the
  model unless a narrowly scoped feature explicitly needs them.
- Make event writes idempotent using local link rows plus Google event etags. Surface conflicts for
  review instead of silently overwriting external edits.

## Implementation order

1. Land auth and user ownership for personal-data rows.
2. Add Calendar schemas, encrypted token storage, Effect service, and OAuth callback tests.
3. Build Settings connect/select/disconnect UI.
4. Add bounded on-demand sync with sync-token recovery tests.
5. Add read-only availability endpoint and chat tool with context-size limits.
6. Add event proposal UI and explicit write confirmation.
7. Extend privacy export/deletion, observability, and runbooks.
8. Evaluate scheduled or push sync from real latency and quota evidence.

## Acceptance criteria

- Calendar consent is separate from sign-in and begins read-only.
- Tokens never reach client storage, logs, exports, or model context.
- Selected calendar events refresh incrementally and recover from an invalid sync token.
- The assistant can answer availability questions with a bounded, timezone-correct response.
- No event is created, changed, or deleted without a visible preview and explicit confirmation.
- Disconnect revokes access where possible and removes all local Calendar secrets and cached data.
- The MVP uses existing Worker and D1 infrastructure and adds no paid service dependency.

## Decisions log

- 2026-07-15: use incremental Calendar consent after application auth.
- 2026-07-15: ship read-only, on-demand synchronization before event writes or push channels.
- 2026-07-15: keep the provider behind an Effect service and store only encrypted refresh tokens.
