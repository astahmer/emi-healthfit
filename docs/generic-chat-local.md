# Generic chat local development

The canonical generic fixture runs its web app on port `3233` and its Alchemy Worker on the local Worker port `8787`.

The recommended command starts both processes, waits for the Worker health route, and uses the
existing root `.env` while overriding only the generic web origin:

```sh
pnpm generic:dev
```

For separate terminals, the Worker needs the web origin as its public auth origin because Vite
proxies the browser's same-origin `/api` requests:

```sh
BETTER_AUTH_URL=http://127.0.0.1:3233 pnpm generic:worker:dev
pnpm generic:web:dev
```

If the repository root has a `.env`, use an explicit env file with the generic command instead of
changing the main app's `BETTER_AUTH_URL`. Alchemy gives an explicit dotenv file precedence over
the process environment; a different value causes anonymous sign-in to return `Invalid origin`.

Vite proxies `/api/*` from `http://127.0.0.1:3233` to `http://127.0.0.1:8787`. The browser therefore uses the same-origin API path in development and never treats the Vite SPA fallback as an API response. Set `VITE_WORKER_ORIGIN` when the Worker is running on another local origin.

For a deployed or separately hosted Worker, set `VITE_API_ORIGIN` before building the web app. It
must be the API origin, without a trailing slash, and the Worker must trust the browser origin
used by `BETTER_AUTH_URL`.

WebMCP is an opt-in build capability. Set `VITE_WEBMCP_ENABLED=true` for local discovery checks or
the staging build; leave it unset for a normal build. The app still feature-detects
`document.modelContext`, so browsers without WebMCP behave normally.

For real Chrome local discovery, start the local stack:

```sh
VITE_WEBMCP_ENABLED=true pnpm generic:dev
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

The `generic:dev` startup wait is only a narrow readiness check for the Worker health route. It
does not replace the API integration or browser E2E suites.
