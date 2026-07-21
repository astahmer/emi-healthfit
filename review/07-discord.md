# Review: Discord bot, linking, `/ask` (`nounlypn` → `xlxqtyys`)

## Context

Ed25519 verify transport → HealthFit slash commands → Discord link codes/tables/Settings UI → deferred `/ask` with internal secret → Alchemy docs.

## Comments

### C-060 — Interaction signature verification
- **Status:** resolved (positive)
- **Introduced:** `nounlypn` / core discord crypto
- **Severity:** n/a
- **Files:** `packages/core/src/discord/crypto.ts`, `verify-request.test.ts`
- **Comment:** Freshness skew + Ed25519 covered. Good foundation.

### C-061 — Link codes hashed, TTL, max active
- **Status:** resolved (mostly)
- **Introduced:** `ksvuxssx`
- **Severity:** n/a
- **Files:** `packages/core/src/server/db/discord-links.ts`
- **Comment:** SHA-256 of normalized code, 10m TTL, max 3 active — solid. Basic consume-once test exists.

### C-062 — `consumeDiscordLinkCode` TOCTOU on concurrent consume
- **Status:** resolved
- **Introduced:** `ksvuxssx`
- **Resolved in:** review follow-up — check `numUpdatedRows`; concurrent consume test
- **Severity:** medium
- **Files:** `packages/core/src/server/db/discord-links.ts`, `packages/core/test/server/discord-links.test.ts`
- **Comment:** Zero-row update now returns `{ ok: false, reason: "consumed" }` before linking.

### C-063 — Internal ask secret compared with `!==`
- **Status:** resolved
- **Introduced:** `oytvnllm`
- **Resolved in:** review follow-up — `secureStringEqual` + missing-header reject
- **Severity:** medium
- **Files:** `apps/api/src/core/http/discord-ask.ts`, `packages/core/src/server/secure-compare.ts`
- **Comment:** Constant-time compare + unit tests.

### C-064 — `/api/discord/ask` trusts `userId` body when secret present
- **Status:** open (accepted for internal mesh; document)
- **Introduced:** `oytvnllm`
- **Severity:** medium (ops)
- **Files:** `discord-ask.ts`, bot `ask.ts`
- **Comment:** By design the bot resolves Discord→user then posts `userId`. Anyone with the internal secret can impersonate any userId and append to `[Discord] /ask` conversations. Mitigations: secret entropy (min 16 already), never expose secret to browser, consider binding secret to bot-only network / Cloudflare service binding later. Document in ops guide.

### C-065 — `/ask` has no fitness tools / user context
- **Status:** open (product deferral)
- **Introduced:** `oytvnllm` / `xlxqtyys`
- **Severity:** low (product)
- **Comment:** Uses `composeSystemPrompt` + plain `generateText` without HealthFit tools. Fine for MVP “coach tone” answers; not equal to in-app chat. Plans already defer richer Discord coach — keep tracked.

### C-066 — Ask failure echoes raw API body to Discord
- **Status:** resolved
- **Introduced:** `xlxqtyys`
- **Resolved in:** review follow-up — stable ephemeral copy + `Effect.logWarning` with body preview
- **Severity:** medium
- **Files:** `apps/discord-bot/src/commands/ask.ts`, `apps/discord-bot/test/interactions.test.ts`
- **Comment:** Discord users only see “Ask failed. Try again in a moment.”

### C-067 — In-memory Discord rate limit Map
- **Status:** open
- **Introduced:** `zomktmpn`
- **Severity:** low
- **Files:** `apps/discord-bot/src/commands/limits.ts`
- **Comment:** `rateBuckets` is process-local. Cloudflare Workers isolates reset / don't share — limit is best-effort only. Document as soft limit; Durable Object / D1 counter if abuse appears.

### C-068 — Missing API tests for `handleDiscordAsk`
- **Status:** resolved (auth/body); open (happy-path with stubbed model)
- **Introduced:** `oytvnllm`
- **Resolved in:** review follow-up — `apps/api/test/discord-ask.test.ts`
- **Severity:** medium → low
- **Files:** `apps/api/test/discord-ask.test.ts`
- **Comment:** Unauthorized + invalid body covered. Optional: stub `generateText` / OpenAI base URL for conversation-reuse happy path.

### C-069 — GymData adopt / deploy docs
- **Status:** resolved (documented)
- **Introduced:** `uylqslrn` / `rwxzyuuo`
- **Severity:** n/a
- **Comment:** Alchemy-first setup and adopt blocker recorded. Ops, not code defect.

### C-076 — Settings keeps showing revoked Discord code
- **Status:** resolved
- **Introduced:** `tvystsmu`
- **Resolved in:** review follow-up — clear `latestCode` on revoke; e2e `discord.spec.ts`
- **Severity:** low (UX)
- **Files:** `apps/chat/app/discord-link-controls.tsx`
- **Comment:** Revoke removed the code from the active list but left the large mono display until the next generate.
