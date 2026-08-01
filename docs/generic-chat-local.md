# Generic chat local development

The canonical generic fixture runs its web app on port `3233` and its Alchemy Worker on the local Worker port `8787`.

Start both processes in separate terminals:

```sh
pnpm generic:worker:dev
pnpm generic:web:dev
```

Vite proxies `/api/*` from `http://127.0.0.1:3233` to `http://127.0.0.1:8787`. The browser therefore uses the same-origin API path in development and never treats the Vite SPA fallback as an API response. Set `VITE_WORKER_ORIGIN` when the Worker is running on another local origin.

For a deployed or separately hosted Worker, set `VITE_API_ORIGIN` before building the web app. It must be the Worker origin, without a trailing slash.
