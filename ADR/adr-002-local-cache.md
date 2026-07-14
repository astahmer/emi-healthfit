# ADR 002: Local session cache

## Status

Accepted

## Context

Sessions (chat threads) live in the Cloudflare D1 database. We want a local browsable/searchable copy so the sidebar still works offline and feels instant on slow networks. The remote database remains the single source of truth.

Requirements:
- Cache threads and messages locally.
- Keep remote sync simple and automatic.
- Do not re-architect the app around local-first conflict resolution.
- Work inside the browser.

Options considered (from https://www.localfirst.fm/landscape/):
- **Dexie.js**: Thin wrapper over IndexedDB, small API, no sync engine, perfect for a cache.
- **RxDB / PowerSync / Electric SQL**: Full local-first replication stacks with conflict handling. Overkill for a cache and would require adopting their sync models.
- **idb-keyval**: Even smaller, but lacks typed tables/queries. Dexie gives us indexes and typed tables for little extra cost.

## Decision

Use **Dexie.js** for IndexedDB management.

The cache stores `threads` and `messages` tables. The sidebar loads local data immediately, then syncs from `/api/threads` in the background. Mutations still hit the API first, then update the cache. A footer indicator shows sync state and last sync time; manual sync is available in Settings.

## Consequences

- New chat dependency: `dexie`.
- New module: `app/session-cache.ts`.
- Sidebar is optimistic and still usable offline.
- Remote remains the source of truth; no conflict resolution needed.
- Online/focus events trigger automatic background sync.
