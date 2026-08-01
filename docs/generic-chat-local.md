# Generic chat local development

The canonical generic fixture runs its web app on port `3233` and its Alchemy Worker on the local Worker port `8787`.

Start both processes in separate terminals. The Worker needs the web origin as its public auth
origin because Vite proxies the browser's same-origin `/api` requests:

```sh
BETTER_AUTH_URL=http://127.0.0.1:3233 pnpm generic:worker:dev
pnpm generic:web:dev
```

If the repository root has a `.env`, set its `BETTER_AUTH_URL` to
`http://127.0.0.1:3233` for this stack or start Alchemy with an explicit env file. Alchemy loads
the root `.env` before shell overrides, so a different value there causes anonymous sign-in to
return `Invalid origin`.

Vite proxies `/api/*` from `http://127.0.0.1:3233` to `http://127.0.0.1:8787`. The browser therefore uses the same-origin API path in development and never treats the Vite SPA fallback as an API response. Set `VITE_WORKER_ORIGIN` when the Worker is running on another local origin.

For a deployed or separately hosted Worker, set `VITE_API_ORIGIN` before building the web app. It must be the public app origin used by `BETTER_AUTH_URL`, without a trailing slash.
