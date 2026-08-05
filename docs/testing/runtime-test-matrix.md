# Runtime test matrix

The repository uses layered tests. A passing unit suite is not evidence that the Worker topology or
browser composition works, so each layer remains additive.

| Layer | Owns | Required evidence |
| --- | --- | --- |
| Core actor tests | State machines, actor lifecycle, stale work, cancellation, adapters | Start a real actor; assert snapshots and typed outcomes |
| Core React tests | Generic provider, hooks, primitives, thread and viewport policy | Render the public boundary; exercise commands and cleanup |
| App component tests | Theme, feedback, usage, export/import, privacy, releases, service-worker composition | Render the actual app component with injected boundaries |
| API integration tests | Worker handlers, Effect services, SQLite/D1 mappings, auth and contracts | Execute real handlers and persistence; avoid replacing behavior with mocks |
| Browser E2E (mock mode) | User-visible routes and app flows | Run the browser against the built/dev app with a stateful in-browser API mock |
| Worker browser smoke | Browser-to-Worker topology, auth session, guest sign-in, API route | Start the real Worker and web proxy; use a real browser request path |
| Coverage gate | Regression signal for core, chat, generic web, and API | Instrument V8 coverage and enforce package thresholds |

## Additive coverage rules

HealthFit browser suites may mock external AI or product APIs when the scenario is deterministic,
but those tests do not replace a real browser-to-Worker smoke. API integration tests similarly do
not replace browser coverage. Keep both when they answer different failure modes.

Coverage thresholds are intentionally package-scoped. A new package must add instrumentation and a
threshold before it is included in `release:check`; do not hide uncovered code by excluding source
that is part of the public runtime.

## Browser E2E modes

Both browser suites (`apps/chat` and `apps/generic-web`) run in two modes. Mock mode is
deterministic; the chat real Worker mode is part of the release gate, and the generic-web real
Worker smoke stays opt-in.

| App | Mock mode command | App under test | API | AI |
| --- | --- | --- | --- | --- |
| chat | `pnpm --dir apps/chat test:e2e` (adds the production build; `test:e2e:run` reuses an existing `dist/`) | Built production bundle served by `apps/chat/scripts/serve-e2e.mjs` | Playwright `page.route` intercepts `**/api/**` and `/ingest`, fulfilled by the in-memory Hono mock in `apps/chat/e2e/mock/app.ts` | Canned SSE streams from `apps/chat/e2e/mock/fixtures.ts` |
| generic-web | `pnpm --dir apps/generic-web test:e2e` | Real Vite dev server on port `3233` (`VITE_WEBMCP_ENABLED=true`) | `page.route("**/api/**")` fulfilled by `apps/generic-web/test/e2e/mock-api.ts` | Canned SSE streams from the same fixture |

Mock mode never reaches a Worker: every API response is generated in-process by a stateful mock
(conversations, messages, threads, memories, notes, suggestions, Hevy/Discord integrations,
ingest, auth sessions). The chat mock also exposes hold/release gates (`holdChat`, `releaseChat`,
`holdDelete`) so scenarios can stall requests and assert queue/race behavior deterministically.
The only browser APIs that are shimmed are `navigator.share` and the `emi-chat-settings`
localStorage entry (fake OpenAI key and provider). Service workers are blocked in every Playwright
config.

What is real in mock mode: the app itself (production bundle or Vite dev server), routing,
history, localStorage, rendering, and all non-network browser behavior. What is mocked: the entire
backend API and the model.

### Real Worker mode (release gate)

The chat real-Worker suite is self-contained and runs on raw fixed ports — no Portless, no named
hosts: `pnpm --dir apps/chat test:e2e:worker` runs `apps/chat/scripts/run-worker-e2e.mjs`, which
starts:

- a fake OpenAI-compatible provider (`apps/chat/e2e/mock/provider-server.mjs`) on
  `127.0.0.1:1399` — streaming chat requests reply `Real worker reply` and emit a
  `get_workout_streak` tool call when the user message asks for the streak; non-streaming
  requests (conversation titles) get a plain JSON completion;
- the real API Worker through `alchemy dev` on `127.0.0.1:1337` (`strictPort`; override with
  `WORKER_E2E_API_PORT`) with a temporary `.env` filtered from the root `.env` (auth secrets,
  `ALLOWED_EMAILS`, Hevy encryption key, `OPENAI_API_KEY`, and `BETTER_AUTH_URL` pointing at the
  web app);
- the real chat app through Vite dev on `127.0.0.1:3232` (override with `WORKER_E2E_WEB_PORT`)
  with `API_BASE_URL` pointing at the Worker.

It then runs the `e2e/features-worker/` BDD scenarios and `e2e/worker-smoke.spec.ts` with
`HEALTHFIT_REAL_WORKER=1`. The stored settings point the OpenAI client at the fake provider
(`http://127.0.0.1:1399/v1`), so only the LLM is mocked. Real: Better Auth guest sign-in, D1
persistence (messages survive reloads), tool execution, and file uploads with real fixtures
(including HEIC photos).

The runner fails fast when any of its ports (`1337`, `3232`, `1399`) is already in use or the root
`.env` is missing. `release:check` runs this suite after the mock suites; set
`RELEASE_SKIP_WORKER_E2E=1` to skip it (e.g. while a dev server occupies the fixed ports).

The generic-web real-Worker smoke is `test/e2e/worker-smoke.spec.ts`, skipped unless
`GENERIC_REAL_WORKER=1`. Start the Worker (e.g. `pnpm generic:dev`) and run
`GENERIC_REAL_WORKER=1 pnpm --dir apps/generic-web test:e2e`; it asserts `/api/health`,
`/api/settings`, `/api/releases`, and guest auth boot through the Vite proxy.

## Minimum actor/provider assertions

For a new actor, test at least the normal completion and failure paths. For a replaceable or
restartable actor, test stale completion/cancellation. For a provider, test StrictMode start and
dispose, prop synchronization, and that the final cleanup stops all owned actors. For a browser
adapter, test storage/channel behavior through injected doubles and include one integration path
with the real platform topology when the adapter affects routing or deployment.

## Verification command groups

Use focused checks during implementation:

```text
pnpm --dir packages/core test:coverage
pnpm --dir apps/chat test:coverage
pnpm --dir apps/generic-web test:coverage
pnpm --dir apps/api test:coverage
pnpm --dir apps/chat test:e2e:worker   # real Worker browser smoke (part of release:check)
```

The final handoff runs `pnpm release:check`, which includes the package coverage gates and the
mock-mode browser suites (`pnpm --filter @emi/chat test:e2e` and
`pnpm --filter @emi/generic-web test:e2e`) plus the chat real-Worker suite
(`pnpm --filter @emi/chat test:e2e:worker`). The generic-web Worker smoke stays opt-in because it
expects a Worker already running locally.
