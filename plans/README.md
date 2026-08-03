# Plans

## Core architecture

The current `@emi/core` contract and audit are shipped documentation:
[core-api.md](../docs/core-api.md) and [core-audit.md](../docs/core-audit.md).

| Plan                                                                  | Status             | Role                                                                                         |
| --------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| [Core maintainability audit](./core-maintainability-audit.md)         | REFERENCE / FOLLOW-UP | Whole-codebase findings, Effect follow-ups, and unresolved architecture questions.                 |
| [Core chat solutions comparison](./core-chat-solutions-comparison.md) | REFERENCE / FUTURE | Comparable chat products, capability gaps, and recommended future boundaries.                         |
| [Core chat platform](./core-chat-platform.md)                         | ACTIVE             | Broader generic chat product, generated-app, and deployment migration.                                |

Start core product work with the platform plan. Use the [core API contract](../docs/core-api.md)
for public boundaries and [core audit](../docs/core-audit.md) for implementation evidence; use
the platform plan for product-level fixture and deployment work.

## Integrations and experiments

| Plan                                                                                 | Status             | Role                                                                                 |
| ------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------ |
| [Discord bot](./discord-bot.md)                                                      | ACTIVE / HARDENING | MVP is shipped; `/ask`, rate-limit, deployment, and trust-boundary hardening remain. |
| [Google Calendar](./google-calendar.md)                                              | PLANNED            | Privacy-sensitive read-first integration design.                                     |
| [WebMCP generic chat](./webmcp-generic-chat.md)                                      | EXPERIMENTAL       | Optional browser-agent integration while the WebMCP API evolves.                     |

`_template.md` is the plan-authoring template. Completed one-off extraction plans and handoff
prompts are removed rather than kept in the active index.
