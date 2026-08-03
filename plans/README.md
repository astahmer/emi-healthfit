# Plans

## Core architecture

The current `@emi/core` contract and audit are shipped documentation:
[core-api.md](../docs/core-api.md) and [core-audit.md](../docs/core-audit.md).
The maintainability audit disposition is recorded in [core-audit.md](../docs/core-audit.md); no
separate maintainability follow-up plan remains.

| Plan                                                                  | Status             | Role                                                                                         |
| --------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| [Core chat solutions comparison](./core-chat-solutions-comparison.md) | REFERENCE / FUTURE | Comparable chat products, capability gaps, and recommended future boundaries.                         |

Start core product work with the [core API contract](../docs/core-api.md), [core audit](../docs/core-audit.md),
and the [extension](../docs/extension-guide.md) and [deployment](../docs/deployment.md) guides.

## Integrations and experiments

| Plan                                                                                 | Status             | Role                                                                                 |
| ------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------ |
| [Discord bot](./discord-bot.md)                                                      | ACTIVE / HARDENING | MVP is shipped; `/ask`, rate-limit, deployment, and trust-boundary hardening remain. |
| [Google Calendar](./google-calendar.md)                                              | PLANNED            | Privacy-sensitive read-first integration design.                                     |
| [WebMCP generic chat](./webmcp-generic-chat.md)                                      | EXPERIMENTAL       | Optional browser-agent integration while the WebMCP API evolves.                     |

`_template.md` is the plan-authoring template. Completed one-off extraction plans and handoff
prompts are removed rather than kept in the active index.
