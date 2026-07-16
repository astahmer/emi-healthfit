# Vite and TanStack Router migration implementation session prompt

Implement `plans/vite_tanstack_router_migration.md` as one staged migration task. Read `AGENTS.md`, the
full plan, current Next/Serwist configuration, route consumers, service worker, Alchemy asset setup,
and browser tests before editing.

Run Vite and TanStack Router alongside Next first. Port routes, validated search parameters, navigation,
providers, metadata, assets, CSS, environment variables, service worker, offline cached reads, and
Cloudflare asset fallback incrementally. Preserve `/api/*`, progressive chat streaming, generation
continuation across navigation, refresh resume, shared links, threading, and direct Worker URLs.

Measure browser streaming behavior through both direct Worker and production asset origins before
cutover. Remove Next, its Serwist adapter, mocks/config, and compatibility code only after every exit
criterion passes. Do not combine the compatibility phase and deletion phase into one irreversible
change.

Use the seven migration revisions in the plan as the JJ revision boundaries, adjusting only when a
different boundary is demonstrably safer. Preserve unrelated work, run focused route/offline/streaming
tests and the checks required by `AGENTS.md`, update the plan, and report revision ids, timing evidence,
offline results, final dependency removal, and rollback point.
