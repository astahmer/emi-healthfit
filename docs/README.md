# Documentation

| Doc                                                | Audience                                                  |
| -------------------------------------------------- | --------------------------------------------------------- |
| [architecture.md](./architecture.md)               | How the system is shaped (apps, data, auth, deploy)       |
| [architecture/core-boundaries.md](./architecture/core-boundaries.md) | What belongs in core, adapters, flavors, and apps |
| [architecture/actor-ownership.md](./architecture/actor-ownership.md) | React, XState, Effect, and DOM lifecycle ownership |
| [core-api.md](./core-api.md)                       | Current `@emi/core` public contract and boundaries        |
| [core-audit.md](./core-audit.md)                   | `@emi/core` audit evidence and follow-up                  |
| [extension-guide.md](./extension-guide.md)         | Add prompts, tools, pages, renderers, and validated parts |
| [configuration.md](./configuration.md)             | Runtime, provider, settings, and environment configuration |
| [deployment.md](./deployment.md)                   | Generic Worker, generated app, and Alchemy deployment    |
| [features.md](./features.md)                       | What the product can do today (and what is still planned) |
| [USER_GUIDE.md](./USER_GUIDE.md)                   | Non-developer usage (export, upload, chat)                |
| [database-schema.md](./database-schema.md)         | Table map and naming notes                                |
| [hevy-integration.md](./hevy-integration.md)       | Hevy sync agent notes                                     |
| [session-diagnostics.md](./session-diagnostics.md) | Conversation diagnostics workflow                         |
| [local-environment.md](./local-environment.md)     | Environment ownership, setup, and named local URLs        |
| [webmcp-r1.md](./webmcp-r1.md)                     | WebMCP R1 rollout and browser verification                |
| [testing/runtime-test-matrix.md](./testing/runtime-test-matrix.md) | Layered runtime, Worker, browser, and coverage tests |
| [prompts/](./prompts/)                             | Prompt versions used by the coach                         |

Related elsewhere in the repo:

- Root [README](../README.md) — setup, deploy, API quick reference
- [ADR/](../ADR/) — accepted design decisions
- [plans/](../plans/) — active feature plans (not shipped docs)
