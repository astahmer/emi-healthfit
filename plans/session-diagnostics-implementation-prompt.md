# Session diagnostics implementation session prompt

Implement `plans/session-diagnostics.md` as one observability/export task. Read `AGENTS.md`, the entire
plan, the session 9745 postmortem, current D1 schemas/repositories, Worker logging, stream persistence,
and Wrangler deployment configuration before editing.

Deliver the schema-versioned owner-safe diagnostic bundle, durable generation/chat-event telemetry,
shared request/trace/generation ids, authenticated HTTP export, Wrangler-backed
`pnpm diagnose:session --url <url> --env <env>` command, deterministic analyzer, and Markdown/JSON
reports. The CLI must work without browser control or copied cookies and redact sensitive data by
default.

Implement retention/deletion and strict ownership checks. Never export OAuth/provider secrets, cookies,
raw headers, or unrelated records. Keep diagnostics read-only; do not replay side-effecting tools. Add
fixtures for success, tool failure, disconnect, timeout, provider failure, and persistence failure, and
ensure the 9745 fixture produces the expected findings.

Use multiple coherent JJ revisions for schema/repositories, instrumentation, bundle/API, CLI, analyzer,
and tests/docs. Preserve unrelated work, run the checks required by `AGENTS.md`, update the plan, and
report revision ids, a sample redacted report path, authorization evidence, retention behavior, and the
exact one-command workflow for future agents.
