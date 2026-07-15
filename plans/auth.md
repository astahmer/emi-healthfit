# Auth plan (better-auth + Google OAuth)

## Current architecture

- `apps/chat` is a Next.js static export. Its same-origin `/api/*` requests are rewritten/proxied to
  `apps/api` during development and served through the Worker assets binding in production.
- `apps/api` is one Alchemy-managed Cloudflare Worker using Effect, D1, R2, AI Gateway, and static
  assets. Routing is centralized in `api.worker.ts`.
- D1 now contains health/workout data, conversations and branches, durable generation state,
  memories, notes, suggestions, and privacy preferences. These rows currently have no owner id.
- Settings currently stores an optional provider API key in browser localStorage. Authentication
  does not make that storage server-safe.

## Goal

Allow only configured Google accounts to sign in, isolate every personal row by user, and reject
unauthenticated access to all personal-data, chat, import/export, privacy, memory, note, analytics,
and generation endpoints.

## Decisions

- Use `better-auth` with the existing D1 database and Google as the initial identity provider.
- Keep the email allowlist as an enrollment rule, but authorize requests by stable user id after
  account creation. Email is not a row-ownership key.
- Generate checked-in SQL migrations; do not expose a production migration endpoint.
- Use secure HTTP-only cookies on the same public origin. Keep `/api/auth/*`, health checks, and
  static assets public; protect everything else by default.
- Calendar consent is separate and incremental. Signing in must not grant Calendar access.

## Data migration and ownership

1. Add better-auth tables using generated SQL in `apps/api/migrations`.
2. Add nullable `user_id` to all personal root tables first: conversations, health/workout sources,
   sync cursors, memories, notes, suggestions, and privacy preferences. Child message/thread/
   generation rows derive ownership through their conversation.
3. Backfill existing data to the first allowlisted owner through an explicit one-off command that
   prints counts and requires confirmation.
4. Rebuild constraints/indexes so new personal rows require `user_id`; add compound indexes matching
   existing date/status queries.
5. Change every database operation to accept an authenticated principal and include ownership in
   selects, updates, deletes, cloning, search, export/import, and generation resume.
6. Add cross-user isolation tests before enabling a second account.

## Worker implementation

1. Add dependencies through the pnpm workspace catalog and configure better-auth in
   `apps/api/src/auth` with Effect-wrapped boundaries.
2. Mount the auth handler before the catch-all asset route.
3. Implement one request-auth function that calls `auth.api.getSession` with request headers,
   validates the allowlist for active users, and returns a typed principal.
4. Group public routes explicitly. Wrap all other API handlers with authentication instead of
   remembering to protect routes one by one.
5. Pass the principal into Effect operations; add spans and `Effect.log*` with user ids or token
   values redacted.
6. Use `ctx.waitUntil`/the Alchemy Worker runtime only for better-auth background work documented as
   safe after the response.
7. Add `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, Google client credentials, and `ALLOWED_EMAILS` as
   Worker secrets/environment. Document local values in `.env.example`, never real secrets.

## Frontend implementation

- Add `/auth/` with Google sign-in, denied-account, callback-failure, and retry states.
- Add a session provider that distinguishes loading, authenticated, and anonymous states without a
  protected-page flash.
- Redirect anonymous users before mounting chat runtimes or fetching sidebar history.
- Add an account menu with email, connection settings, and sign-out.
- On `401`, clear private TanStack Query/session caches and route to sign-in. Do not repeatedly replay
  a failed chat mutation.
- Keep provider API keys local for now; a later server-key feature needs separate encrypted storage.

## Security details

- Normalize allowlisted emails once, require Google `email_verified`, and reject enrollment before
  creating durable user state.
- Use OAuth state/PKCE and exact HTTPS callback URLs outside localhost.
- Apply CSRF/origin protections to cookie-authenticated mutations and retain current CORS headers
  only where the same-origin architecture needs them.
- Rate-limit sign-in, callback, chat generation, import, and destructive privacy routes per user and
  coarse IP key.
- Revoke sessions after allowlist removal and provide an admin-only way to list/revoke sessions.

## Verification order

1. Migration tests and one-owner backfill dry run.
2. Allowlist and verified-email tests.
3. Public/protected route matrix tests, including stream resume and R2 import/export.
4. Two-user database isolation tests for list/read/update/delete/search/clone.
5. Frontend session-loading and `401` cache-clearing tests.
6. Manual Google OAuth smoke test on preview and production callback URLs.
7. `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm fmt`, and Knip.

## Acceptance criteria

- Only allowlisted, verified Google accounts can create or use a session.
- Every personal query and mutation is scoped by stable user id; a guessed id cannot cross accounts.
- Anonymous chat, stream resume, analytics, notes, memories, import/export, privacy, and ingestion
  calls return `401` without doing work.
- Existing single-user data is backfilled with reviewed counts and remains accessible.
- Sign-out clears the HTTP-only session and all in-browser private caches.
- Calendar scopes are absent until the separate Calendar connection flow begins.

## Decisions log

- 2026-07-15: user ownership migration is part of auth, not deferred cleanup.
- 2026-07-15: protect routes by default and keep a small explicit public-route list.
- 2026-07-15: reuse D1 and Alchemy; no separate auth Worker or auth database initially.
