# Discord bot implementation session prompt

Implement the MVP in `plans/discord-bot.md` as one task. Read `AGENTS.md`, the full plan, and current
auth/ownership/data-access code first. Verify the ownership prerequisite; never expose shared legacy
data to Discord users.

Build the Cloudflare Worker bot with raw-body Ed25519 verification before JSON parsing, timestamp replay
protection, Effect Schema interaction decoding, Ping handling, registered MVP commands, owner link-code
creation/revocation, owner resolution before every data command, ephemeral replies, rate limits, and
bounded response sizes. Share owner-scoped domain/data-access packages; do not import API internals.

Keep `/ask`, R2, provider keys, AI Gateway, and background AI work out of the MVP. Add registration and
deployment scripts without logging tokens or personal interaction payloads. Cover signature failures,
replay, malformed interactions, unlinked users, cross-owner isolation, command output, link expiry and
single use, and rate limits with real implementations rather than mocks where practical.

Use multiple coherent JJ revisions for shared data access, schema/migrations, Worker security/commands,
Settings linking UI, and deployment/tests. Preserve unrelated work, run the checks required by
`AGENTS.md`, update the plan status, and report revision ids, verification, required secrets, and exact
preview/production registration steps.
