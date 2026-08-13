# Generic chat local development

The canonical generic fixture runs its web app on port `3233` and its Alchemy Worker on the local Worker port `8787`.

Run the Worker and the web app in two terminals:

```sh
cp apps/generic-worker/.env.example apps/generic-worker/.env
# set BETTER_AUTH_SECRET to at least 32 random characters
pnpm --dir apps/generic-worker dev
```

```sh
pnpm --dir apps/generic-web dev
```

The Worker reads `apps/generic-worker/.env`; keep HealthFit secrets in the root `.env` and never
copy that file into the generic app. `BETTER_AUTH_URL` is the web origin the browser uses
(`http://localhost:3233`), because Vite proxies the browser's same-origin `/api` requests to the
Worker. A mismatched value causes anonymous sign-in to return `Invalid origin`.

Vite proxies `/api/*` from `http://127.0.0.1:3233` to `http://127.0.0.1:8787`. The browser therefore uses the same-origin API path in development and never treats the Vite SPA fallback as an API response. Set `VITE_WORKER_ORIGIN` when the Worker is running on another local origin.

For a deployed or separately hosted Worker, set `VITE_API_ORIGIN` before building the web app. It
must be the API origin, without a trailing slash, and the Worker must trust the browser origin
used by `BETTER_AUTH_URL`.

WebMCP is an opt-in build capability. Set `VITE_WEBMCP_ENABLED=true` for local discovery checks or
the staging build; leave it unset for a normal build. The app still feature-detects
`document.modelContext`, so browsers without WebMCP behave normally.

For real Chrome local discovery, start the local stack:

```sh
pnpm --dir apps/generic-worker dev
VITE_WEBMCP_ENABLED=true pnpm --dir apps/generic-web dev
```

Loopback origins count as secure contexts, so register WebMCP for the exact origin
`http://127.0.0.1:3233`, then put the returned token in the ignored
`apps/generic-web/.env.local` file:

```sh
WEBMCP_ORIGIN_TRIAL_TOKEN=your-origin-trial-token
```

Vite sends `Origin-Trial` only when this local/deployment variable is present; never commit the
token or add it to a versioned example file.

## Test layers

The generic fixture keeps these checks distinct:

- `pnpm --dir apps/generic-web test` runs unit and actor tests without a live Worker.
- `pnpm --dir apps/generic-web test:api` is an integration test: it crosses the Vite proxy,
  Worker routes, anonymous auth, D1 persistence, safe settings/releases metadata, and a local
  OpenAI-compatible SSE provider.
- `pnpm --dir apps/generic-web test:e2e` runs browser scenarios, including the Playwright BDD
  Gherkin features. Set `GENERIC_REAL_WORKER=1` to add the real Worker browser smoke; the normal
  suite keeps deterministic route fixtures for the larger interaction matrix.

See `docs/testing/runtime-test-matrix.md` for what each browser E2E mode mocks and what it leaves
real (app, Worker, D1, auth, tools, provider).

The `alchemy dev` startup wait for the Worker health route is a narrow readiness check; it does not
replace the API integration or browser E2E suites.
