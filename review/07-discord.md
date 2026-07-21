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
- **Status:** open
- **Introduced:** `ksvuxssx`
- **Severity:** medium
- **Files:** `packages/core/src/server/db/discord-links.ts`
- **Comment:** Update sets `consumed_at` with `where consumed_at is null` but **does not check `numUpdatedRows`**. Two concurrent consumers can both pass the pre-check, both update (second updates 0 rows), and both still `insertInto(discord_account_links)` — last write wins on `discord_user_id` conflict, but a second Discord user could race onto the same code before the first insert if timing differs. Fix: after update, if `numUpdatedRows === 0`, return `{ ok: false, reason: "consumed" }` and skip link insert. Add a regression test.

### C-063 — Internal ask secret compared with `!==`
- **Status:** open
- **Introduced:** `oytvnllm`
- **Severity:** medium
- **Files:** `apps/api/src/core/http/discord-ask.ts`
- **Comment:** `provided !== config.DISCORD_INTERNAL_ASK_SECRET` is not constant-time. For a shared Worker secret this is a modest risk, but easy to fix with a timing-safe compare helper (length check + XOR fold). Also reject missing header explicitly the same path.

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
- **Status:** open
- **Introduced:** `xlxqtyys`
- **Severity:** medium
- **Files:** `apps/discord-bot/src/commands/ask.ts`
- **Comment:** On `!response.ok`, content includes `bodyText.slice(0, 200)`. Internal error JSON / stack fragments can leak to the guild ephemeral message. Prefer a stable user-facing string + log the body server-side (bot logs).

### C-067 — In-memory Discord rate limit Map
- **Status:** open
- **Introduced:** `zomktmpn`
- **Severity:** low
- **Files:** `apps/discord-bot/src/commands/limits.ts`
- **Comment:** `rateBuckets` is process-local. Cloudflare Workers isolates reset / don't share — limit is best-effort only. Document as soft limit; Durable Object / D1 counter if abuse appears.

### C-068 — Missing API tests for `handleDiscordAsk`
- **Status:** open
- **Introduced:** `oytvnllm`
- **Severity:** medium
- **Files:** no `apps/api/test/*discord*ask*`
- **Comment:** Bot tests cover defer/unlinked path; API handler auth + body validation + conversation reuse lack direct tests. Add unit/integration coverage with stubbed `generateText`.

### C-069 — GymData adopt / deploy docs
- **Status:** resolved (documented)
- **Introduced:** `uylqslrn` / `rwxzyuuo`
- **Severity:** n/a
- **Comment:** Alchemy-first setup and adopt blocker recorded. Ops, not code defect.
