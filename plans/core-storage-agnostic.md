# Making @emi/core Storage-Agnostic & Reusable

Status: proposed (findings + plan, no code changed yet)
Scope: `packages/core` only
Date: 2026-08-24

## Why (north star)

We just decided to **vendor (fork-copy) the chat runtime + thread UI out of `@emi/core`
into another product (`dadabase`)** instead of depending on the package, because reuse
required dragging along discord/cloudflare/D1/better-auth/dexie baggage. That decision is
the validation data point: **storage and persistence concerns are not separated cleanly
enough yet.**

Goal going forward: a consumer composes

```
protocol + runtime + thread UI + THEIR OWN transport + THEIR OWN persistence
```

…without forking. If this refactor lands, the dadabase vendoring would have been
unnecessary — keep that as the acceptance test for every step below ("could a new
consumer now assemble this from parts?").

---

## Findings: coupling map

Legend: ✅ already port-shaped / injectable · ⚠️ partially injectable · ❌ hardcoded backend

### Client side (`src/web/`, `src/web/chat-runtime/`)

| File | Backend coupling | Callers | Verdict |
|---|---|---|---|
| `src/web/session-cache.ts` | ❌ **Dexie hardcoded** (`class SessionCacheDatabase extends Dexie`, DB `"EmiSessions"`, tables `threads`/`messages`/`conversationSnapshots`) + module-level free functions (`getCachedThreads`, `setCachedThreads`, `mergeCachedThreads`, `updateCachedThread`, `deleteCachedThread`, `getCachedMessages`, `setCachedConversation`, `get/setCachedConversationSnapshot`, `clearSessionCache`) | re-exported wholesale by `src/web.export.ts:154-164,251-254`; runtime use is opt-in; types `SessionThread`/`SessionMessage(Usage)` leak into `src/web/conversation-snapshot.ts:7`, `src/web/sidebar/sidebar-item-machine.ts:3`, `test/web/*` | Entangled: types are fine (pure), but the *port* doesn't exist — the API shape is "call these module functions", which forces the Dexie import into any consumer who wants offline caching |
| `src/web/chat-runtime/settings-actor.ts:11-14` | ✅ `SettingsStorage { getItem, setItem }` injected via `SettingsActorInput.storage` + `storageKey` | generic-chat-app-machine wiring | **The reference pattern.** Do this everywhere |
| `src/web/chat-runtime/browser-defaults.ts` | ✅ injectable `BrowserDraftsStorage`, online `eventTarget`, `createId`/`now`; adapts to `KeyValueStorage` from `src/runtime/types.ts:15` with a `nullStorage` fallback | browser defaults factory | Clean |
| `src/web/chat-runtime/browser-queue-sync.ts:207` | ✅ `localStorage: BrowserStorageLike` taken as input | queue sync actor | Clean |
| `src/web/chat-runtime/conversation-store-actor.ts:16,40-44` | ⚠️ no dexie, but depends on `ConversationClient` (`conversation-client.ts`: fetch + Effect-Schema decoding of the `/conversations`,`/threads`,`/memories` REST wire format). A consumer with local/no-HTTP persistence must stand up a fake HTTP server or reimplement the client | conversation-store actor input | Half-clean: the actor logic is reusable, the *data source* isn't pluggable |
| `src/web/auth/anonymous-session.ts`, `auth-session.ts` | ❌ hardcode better-auth endpoint shapes (`AnonymousSession.signInPath`, session-cookie fetch wrapping); `AuthSession` class binds better-auth client behavior | exported via `web.export.ts`; tested in `test/web/anonymous-session.test.ts`, `auth-session.test.ts` | Entangled: fine as *reference implementations*, wrong as the only option |
| `src/web/webmcp.ts`, `chat-runtime/webmcp-actor.ts` (18.6K) | optional feature, no storage backend | opt-in | Out of scope here, but should be a clearly optional contribution, not part of the default assembly |

### Server side (`src/server/`, `src/adapters/`) — mostly already right

| File | Notes | Verdict |
|---|---|---|
| `src/server/ports/chat-server.ts` | ✅ `AuthPort`, `ChatRepositoriesShape` (conversations/messages/generations/memories repository shapes) as Effect `Context.Service`s | Reference pattern, server edition |
| `src/server/ports/conversation-store.ts`, `generation-store.ts`, `memory-store.ts` | ✅ Reader/Writer/Store ports defined before implementations | Clean |
| `src/server/make-conversation-store.ts` | Live impl binding `ConversationDatabase` (drizzle schema + kysely client from `src/server/db/query-database.ts`) onto the ports | Correct direction (adapter→port) |
| `src/server/db/*` | ⚠️ mixes drizzle table definitions (`schema.ts`, `auth-schema.ts`, `discord-schema.ts`), domain query modules (`conversations.ts` 41.4K, `generations.ts`, `memories.ts`), and product baggage (`discord-links.ts`, `discord-schema.ts`, better-auth `auth-schema.ts`) in one folder | Layering exists but product-specific schema lives beside generic chat schema; discord/better-auth pieces don't belong in core's db folder |
| `src/adapters/cloudflare.export.ts` | ✅ implements `ChatRepositoriesShape` over D1 behind `CloudflareDatabase` Context service | Good precedent: backends live in `./adapters/<backend>` |
| `src/testing.export.ts` | ✅ `inMemoryRepositories()` returns `ChatRepositoriesShape` — **in-memory adapters exist for the server ports** | Gap: no in-memory equivalents for client-side `SessionCache`/conversation store |

### What's already injectable (the pattern to follow)

`src/web/chat-runtime/transport-types.ts` is the gold standard:

```ts
export type ChatStreamDecoder = (input: ChatStreamDecoderInput) => Effect.Effect<ChatMessage | undefined, unknown>;
export type ChatTransportErrorDecoder = (input: { response: Response }) => Promise<ChatTransportError | undefined>;
export type ChatMessageEncoder = (input: { messages: ReadonlyArray<ChatMessage>; request: ChatTransportRequest }) => ReadonlyArray<unknown>;
```

Transport is fully pluggable today — a consumer points the decoder at their own SSE
route (this is exactly how the dadabase fork wires `ai-sdk streamText`). Every storage
touchpoint should reach the same bar: **core defines the port + one null/in-memory
default; real backends ship as `./adapters/<backend>` entrypoints.**
`SettingsActorInput.storage`, `BrowserChatDefaultsInput.draftsStorage`, and
`browser-queue-sync`'s `BrowserStorageLike` already meet it; `AuthPort`/
`ChatRepositoriesShape` meet it server-side.

### Summary

- **Clean:** transport seam, settings storage, draft storage, online detection, queue-sync storage, all of `src/server/ports/*`, D1 adapter placement, server in-memory test adapter.
- **Entangled:** `session-cache.ts` (Dexie + module-function API + leaking types), `conversation-store-actor`'s hardwired HTTP `ConversationClient`, better-auth-shaped `auth/*` classes, product schema (discord/better-auth) living in `src/server/db/`.
- **Missing:** client-side in-memory test adapters; dependency-matrix rules that *forbid* `dexie` outside an adapter entrypoint.

---

## Proposed port interfaces

All client-side ports go next to their types in the runtime layer (no react, no
xstate, no backend deps there — mirrors the existing `./chat` and `./runtime`
dependency-matrix rules).

### 1. `SessionCache` (extracted from `src/web/session-cache.ts`)

```ts
// src/web/session-cache-port.ts — types only, zero backend imports
import type { UIMessage } from "ai"; // peer, already optional-friendly

export interface SessionThread {
  id: string;
  title: string | null;
  status: "regular" | "archived";
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionMessageUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface SessionMessage extends UIMessage {
  usage?: SessionMessageUsage;
  model?: string;
  createdAt?: string;
}

export interface ConversationSnapshotData {
  // carried opaquely today (`data: unknown` in CachedConversationSnapshot)
  data: unknown;
}

export interface SessionCache {
  listThreads(search?: string): Promise<SessionThread[]>;
  saveThreads(threads: SessionThread[]): Promise<void>;
  mergeThreads(threads: SessionThread[]): Promise<void>;
  upsertThread(thread: SessionThread): Promise<void>;
  deleteThread(threadId: string): Promise<void>;
  getMessages(threadId: string): Promise<SessionMessage[]>;
  saveConversation(input: {
    threadId: string;
    threads: SessionThread[];
    messages: SessionMessage[];
  }): Promise<void>;
  getConversationSnapshot(conversationId: string): Promise<{ data: unknown } | null>;
  setConversationSnapshot(input: {
    conversationId: string;
    data: unknown;
  }): Promise<void>;
}

export const noopSessionCache: SessionCache = /* every method resolves immediately */;
```

Current Dexie implementation becomes:

```ts
// src/adapters/dexie.export.ts
export const createDexieSessionCache = (options?: {
  databaseName?: string; // default "EmiSessions"
}): SessionCache => { /* existing SessionCacheDatabase body, wrapped */ };
```

### 2. `ConversationStore` (decouples `conversation-store-actor` from HTTP)

```ts
// src/web/chat-runtime/conversation-store-port.ts
import type { Effect } from "effect"; // or plain promises; match actor's existing style
import type { Conversation, Memory, ConversationThread } from "./conversation-client.ts";

export interface ConversationStoreQuery {
  search?: string;
}

export interface ConversationStorePort {
  listConversations(query?: ConversationStoreQuery): Promise<Conversation[]>;
  getConversation(id: string): Promise<{ conversation: Conversation; messages: unknown[] } | null>;
  listThreads(conversationId: string): Promise<ConversationThread[]>;
  getThread(threadId: string): Promise<{ thread: ConversationThread; messages: unknown[] } | null>;
  appendMessages(input: { threadId: string; messages: unknown[] }): Promise<void>;
  listMemories(): Promise<Memory[]>;
}

// One implementation ships in core: thin wrapper over the existing ConversationClient
export const clientConversationStore = (client: ConversationClient): ConversationStorePort => ({ ... });
```

`ConversationStoreActorInput` grows the port instead of the concrete client. A consumer
with server-authoritative persistence passes `clientConversationStore(new ConversationClient(...))`;
an offline/local consumer implements the port against IndexedDB/pglite/whatever directly —
no HTTP server required.

### 3. `AuthSessionProvider` (replaces hardcoded better-auth classes)

```ts
// src/runtime/auth-port.ts (client side)
export interface AuthSessionProvider {
  /** Wrap fetch so requests carry identity; may sign in lazily. */
  authenticatedFetch(): Promise<typeof globalThis.fetch>;
  readonly subject: string | undefined;
}

export const anonymousSessionProvider = (input: {
  apiOrigin: string;
  fetch?: typeof globalThis.fetch;
}): AuthSessionProvider => ({ ... }); // current AnonymousSession logic, kept as reference impl
```

`AnonymousSession`/`AuthSession` move behind `./adapters/better-auth` (or remain as the
reference provider) and stop being the only thing `web.export.ts` offers.

### 4. Existing seams (documented, unchanged)

- Transport: `ChatStreamDecoder` / `ChatMessageEncoder` / `ChatTransportErrorDecoder` (`src/web/chat-runtime/transport-types.ts`).
- Settings: `SettingsStorage` (`settings-actor.ts`).
- Drafts/identity/browser: `BrowserChatDefaultsInput` (`browser-defaults.ts`).
- Queue sync persistence: `BrowserStorageLike` (`browser-queue-sync.ts`).
- Server: `AuthPort`, `ChatRepositoriesShape` (`src/server/ports/chat-server.ts`), store ports under `src/server/ports/`.

---

## Refactor steps

### Phase A — extract ports (no behavior change)

- [ ] A1. Split `src/web/session-cache.ts`: pure types (`SessionThread`, `SessionMessage`, `SessionMessageUsage`) → `src/web/session-cache-types.ts`; fix type-only importers (`conversation-snapshot.ts`, `sidebar/sidebar-item-machine.ts`, `web.export.ts`) to import from the types module.
- [ ] A2. Define `SessionCache` port + `noopSessionCache` beside the types; reimplement the current free functions as `createDexieSessionCache()` internally (same Dexie schema, same behavior).
- [ ] A3. Change `ConversationStoreActorInput` to take `ConversationStorePort`; provide `clientConversationStore(client)` and use it wherever `generic-chat-app-machine` currently constructs the actor (zero behavior change for healthfit app).
- [ ] A4. Define `AuthSessionProvider`; re-express `AnonymousSession`'s fetch-wrap on top of it.

### Phase B — move backends behind adapter entrypoints

- [ ] B1. New subpath export `./adapters/dexie` (`src/adapters/dexie.export.ts`) containing `createDexieSessionCache`. Move `dexie` from `dependencies` to an **optional peer of that entrypoint only**; update `publicApi.entrypoints` + `entrypointPaths` in `packages/core/package.json`.
- [ ] B2. New subpath export `./adapters/better-auth` housing `anonymous-session.ts`/`auth-session.ts` (+ later the better-auth peer bits currently implied by `./cloudflare`). Root `./web` keeps exporting only the port + reference provider.
- [ ] B3. Update `publicApi.dependencyMatrix`: `"dexie"` added to `forbidden` for `.`, `./runtime`, `./react`, `./components`, `./web`, `./chat`; allowed only in `./adapters/dexie`. Same treatment for better-auth-related peers vs `./adapters/better-auth`.
- [ ] B4. Add a rewrite gate (extend `publicApi.rewriteGates`, e.g. `dexie-adapter-only`) enforcing that `dexie` is imported nowhere outside the adapter entrypoint — same mechanism as the existing `healthfit-imports` gate.
- [ ] B5. Server hygiene: relocate product-coupled schema (`discord-links.ts`, `discord-schema.ts`, `auth-schema.ts`) out of generic `src/server/db/` into `./adapters/discord` / `./adapters/better-auth` territory, leaving `db/schema.ts` + query modules generic. Keep `make-conversation-store.ts` as the canonical "adapter binds ports" example in docs.

### Phase C — testing & contracts

- [ ] C1. Add `inMemorySessionCache()` and `inMemoryConversationStore()` to `src/testing.export.ts` (siblings of the existing `inMemoryRepositories()`).
- [ ] C2. Convert `test/web/session-cache.test.ts` into a **shared contract suite** parameterized over `SessionCache` implementations (in-memory always; dexie where indexedDB available — `fake-indexeddb` is already a devDep). Every future backend adapter must pass the same suite.
- [ ] C3. Contract-test `ConversationStorePort` similarly using `conversation-store-actor.test.ts` scenarios with the in-memory store instead of a fetched client.
- [ ] C4. Public-api gates: extend `test/public-api/export-surface.test.ts` expectations for the new `./adapters/*` entrypoints.

### Phase D — documentation

- [ ] D1. README section "Assembling a chat from parts": protocol + runtime + thread UI + your transport decoder + your `SessionCache`/`ConversationStorePort`/`AuthSessionProvider`, with the dadabase case study as the worked example.
- [ ] D2. Note in each port file: constraint rationale (one spelling per concept, backends only via adapters).

### Acceptance check after each phase

> Could a new consumer now build multi-turn chat with **their own** storage and **zero**
> dexie/better-auth/discord/D1 packages installed? If not, the phase isn't done.

If this refactor had existed last week, the dadabase work would have been:
`npm i @emi/core` + one `SessionCache` impl (drizzle/pglite) + one stream decoder —
not a vendored fork. That is the north star; do not lose it during review.

---

## Risks

- `web.export.ts` is a wide public surface (`r0`); moving exports behind adapters is breaking → bump `publicApi.version` and let the rewrite gates flag downstream usages (healthfit app first).
- `conversation-store-actor` is deeply wired into `generic-chat-app-machine`; A3 must be mechanical (wrap, don't rewrite) to keep `conversation-store-actor.test.ts` green.
- Effect 4 beta is the current catalog baseline; port files should stick to type-level Effect usage only, so they survive the 3.x↔4.x drift that external consumers (e.g. dadabase on Effect 3.22) would hit.
