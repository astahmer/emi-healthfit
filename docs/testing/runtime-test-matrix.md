# Runtime test matrix

The repository uses layered tests. A passing unit suite is not evidence that the Worker topology or
browser composition works, so each layer remains additive.

| Layer | Owns | Required evidence |
| --- | --- | --- |
| Core actor tests | State machines, actor lifecycle, stale work, cancellation, adapters | Start a real actor; assert snapshots and typed outcomes |
| Core React tests | Generic provider, hooks, primitives, thread and viewport policy | Render the public boundary; exercise commands and cleanup |
| App component tests | Theme, feedback, usage, export/import, privacy, releases, service-worker composition | Render the actual app component with injected boundaries |
| API integration tests | Worker handlers, Effect services, SQLite/D1 mappings, auth and contracts | Execute real handlers and persistence; avoid replacing behavior with mocks |
| Browser E2E | User-visible routes and app flows | Run the browser against the built/dev app and assert the rendered UI |
| Worker browser smoke | Browser-to-Worker topology, auth session, guest sign-in, API route | Start the real Worker and web proxy; use a real browser request path |
| Coverage gate | Regression signal for core, chat, generic web, and API | Instrument V8 coverage and enforce package thresholds |

## Additive coverage rules

HealthFit browser suites may mock external AI or product APIs when the scenario is deterministic,
but those tests do not replace a real browser-to-Worker smoke. API integration tests similarly do
not replace browser coverage. Keep both when they answer different failure modes.

Coverage thresholds are intentionally package-scoped. A new package must add instrumentation and a
threshold before it is included in `release:check`; do not hide uncovered code by excluding source
that is part of the public runtime.

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
pnpm --dir apps/chat test:e2e:worker   # opt-in real Worker browser smoke
```

The final handoff runs `pnpm release:check`, which includes the package coverage gates and the
existing browser suites. The opt-in Worker smoke remains a separate topology check because it
starts isolated Alchemy services.
