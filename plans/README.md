# Active plans

| Plan                                                                                       | Status      | Order | Dependency |
| ------------------------------------------------------------------------------------------ | ----------- | ----: | ---------- |
| [001 — Extract the generic chat runtime and UI primitives](./001-core-web-chat-runtime.md) | IN PROGRESS |     1 | None |
| [002 — Make React a projection of composed XState actors](./002-xstate-actor-architecture.md) | TODO | 2 | Plan 001 session machine |

Execute plan 001’s remaining UI extraction and then plan 002 actor composition before broadening generated-app deploy acceptance. The Worker/browser smoke work should consume the extracted runtime rather than hard-code generic-app internals.
