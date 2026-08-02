# Plans

## Core architecture

| Plan | Status | Role |
| --- | --- | --- |
| [Core API rewrite](./core-api-rewrite-plan.md) | ACTIVE / NORMATIVE | Clean-slate public API, architecture, distribution model, and agent work packets. |
| [Core audit report](./core-audit-report.md) | REFERENCE | Evidence, completed fixes, remaining findings, and release-gate history. |
| [Core chat platform](./core-chat-platform.md) | ACTIVE | Broader generic chat product, generated-app, and deployment migration. |

Start core work with the rewrite plan. Use the audit report to understand why a boundary exists;
use the platform plan for product-level fixture and deployment work.

## Integrations and experiments

| Plan | Status | Role |
| --- | --- | --- |
| [Discord bot](./discord-bot.md) | ACTIVE / HARDENING | MVP is shipped; `/ask`, rate-limit, deployment, and trust-boundary hardening remain. |
| [Google Calendar](./google-calendar.md) | PLANNED | Privacy-sensitive read-first integration design. |
| [Google Calendar implementation handoff](./google-calendar-implementation-prompt.md) | HANDOFF | Focused implementation prompt for the Calendar plan. |
| [WebMCP generic chat](./webmcp-generic-chat.md) | EXPERIMENTAL | Optional browser-agent integration while the WebMCP API evolves. |

`_template.md` is the plan-authoring template. Completed one-off extraction plans and handoff
prompts are removed rather than kept in the active index.
