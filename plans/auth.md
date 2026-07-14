# Auth plan (better-auth + Google OAuth)

## Context

- Frontend: Next.js static export (`apps/chat`), proxied to the API worker via rewrites (`/api/*`).
- Backend: Cloudflare Worker (`apps/api`), Effect, D1.
- Goal: restrict the app to a small allowlist of users (you + your wife) using Google OAuth.

## Reference repositories

- `.references/better-auth` — https://github.com/better-auth/better-auth

## Goal

Add Google sign-in to the chat app and reject any email not in an env-based allowlist. All API routes that expose personal data require a valid session.

## Tech choices

- **Auth library:** `better-auth`. It is runtime/framework-agnostic, supports Cloudflare Workers, and has a built-in Kysely adapter with a D1 SQLite dialect.
- **Database:** reuse the existing D1 database. Better-auth will create `user`, `session`, `account`, and `verification` tables.
- **OAuth provider:** Google (only social provider for now).
- **Allowlist:** comma-separated env var `ALLOWED_EMAILS`. Checked during sign-in and on every protected route.

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────────┐
│  Next.js    │ ──▶  │  API worker  │ ──▶  │  better-auth    │
│  (static)   │      │  /api/auth/* │      │  + D1 adapter   │
└─────────────┘      └──────────────┘      └─────────────────┘
                            │
                            ▼
                     Google OAuth
```

The Next.js rewrite rule `/api/:path*` already proxies to the API worker, so auth endpoints will be available at `/api/auth/*` on the frontend origin.

## Implementation steps

1. **Add reference repo** (done).
2. **Add dependencies** to `apps/api`:
   - `better-auth`
   - `@better-auth/kysely-adapter` (or use the built-in Kysely adapter that ships with `better-auth`)
   - `@cloudflare/workers-types` (already present)
3. **Create auth config** `apps/api/src/auth/config.ts`:
   - `database: env.DB` (D1 binding; better-auth auto-detects D1 via Kysely).
   - `basePath: "/api/auth"`.
   - `secret: env.BETTER_AUTH_SECRET`.
   - `socialProviders.google`: `clientId` and `clientSecret` from env.
   - `advanced.backgroundTasks` using `ctx.waitUntil`.
   - Hook on `signIn` / `createUser` to reject emails not in `ALLOWED_EMAILS`.
4. **Mount auth handler** in `apps/api/src/api.worker.ts`:
   - Route `/api/auth/*` to `auth.handler` before other routes.
   - Ensure `nodejs_compat` flag is set in wrangler/alchemy config (better-auth uses `AsyncLocalStorage`).
5. **Protect API routes**:
   - Add `requireAuth` middleware in `apps/api/src/auth/require-auth.ts`.
   - Use `auth.api.getSession` with the incoming request headers.
   - Apply to `/api/threads`, `/api/chat`, `/api/summary`, `/api/recovery`, etc.
6. **Run migrations**:
   - Use better-auth’s programmatic migration helper (`getMigrations`) exposed via a one-off `/api/auth/migrate` route or local script.
   - Alternatively generate the SQL from the CLI and add it to the D1 migrations folder.
7. **Frontend auth client** in `apps/chat`:
   - Install `better-auth/client` (or `@better-auth/react`).
   - Create `app/auth/page.tsx` with a “Sign in with Google” button.
   - Create a small hook/context to check session and redirect unauthenticated users.
8. **UI changes**:
   - Add a user avatar dropdown in `NavHeader` with sign-out.
   - Show a landing/sign-in screen when not authenticated.
9. **Env vars** (add to `.env.example` and secrets):
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `ALLOWED_EMAILS` (e.g., `you@gmail.com,wife@gmail.com`)
   - `BETTER_AUTH_SECRET`
   - `BETTER_AUTH_URL` (public URL, used for OAuth callbacks)
10. **Tests**:
    - Unit test allowlist check.
    - Unit test session middleware returns 401 for missing/invalid session.
    - End-to-end smoke test of the Google OAuth callback is optional (hard to automate).
11. **Run checks**: `pnpm typecheck`, `pnpm lint`, `pnpm fmt`.

## Allowlist behavior

- During OAuth callback, better-auth fetches the Google email.
- If the email is not in `ALLOWED_EMAILS`, return an error and do not create a user/session.
- This is enforced both by the auth hook and by the `requireAuth` middleware on API routes as a defense-in-depth measure.

## Open questions

- Should we keep the existing data tables in the same D1 database or create a separate auth DB? Same DB is simpler; auth tables are prefixed by better-auth defaults and won’t collide.
- How do we handle the static-export auth redirect? Use client-side redirect after checking session, or configure the OAuth callback URL to point back to `/auth/callback` which the frontend handles.
- Should unauthenticated visitors see a marketing landing page or be redirected immediately? Start with immediate redirect to `/auth/`.

## Acceptance criteria

- Only emails in `ALLOWED_EMAILS` can successfully sign in.
- Authenticated users can access chat and data endpoints.
- Unauthenticated requests to `/api/chat`, `/api/threads`, etc. return `401`.
- Sign-out clears the session and returns to the sign-in page.
- Session persists across page reloads via HTTP-only cookie.
