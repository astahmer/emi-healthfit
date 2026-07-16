# Google Calendar implementation session prompt

Implement `plans/google-calendar.md` as one privacy-sensitive integration task. Read `AGENTS.md`, the
full plan, existing auth/settings/privacy architecture, and current Google OAuth setup before editing.
Calendar authorization must remain separate from sign-in and begin read-only.

Verify user ownership is complete. Then implement Calendar schemas, encrypted server-side token
storage, Effect services, connect/select/disconnect Settings UI, incremental bounded sync with invalid
sync-token recovery, timezone-correct availability API/tool, privacy export/deletion, observability, and
runbooks. Add event proposal UI and explicit confirmation before any write scope or mutation.

Tokens must never enter client storage, logs, exports, or model context. Disconnect must revoke where
possible and delete local secrets/cache. Do not add a paid service, scheduled sync, push sync, or silent
event writes without the plan's evidence and confirmation gates.

Use multiple coherent JJ revisions for schema/token security, OAuth/service, Settings UI, sync/read
tool, confirmed writes, and privacy/tests/docs. Use official current Google documentation when external
details need verification. Preserve unrelated work, run the checks required by `AGENTS.md`, update the
plan, and report revision ids, scopes, redirect URIs, secrets, and deployment steps.
