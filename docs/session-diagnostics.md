# Session diagnostics

Generate a deterministic, owner-scoped postmortem from a conversation URL without browser control:

```bash
pnpm diagnose:session --url https://example.com/chat/<conversation-id> --env dev
```

The command loads `.env.<stage>` from the workspace root when present, otherwise it uses the
developer's existing Wrangler login. `--env-file <path>` selects another environment file. It finds
the remote `GymData` D1 database for the environment and writes `bundle.json`, `findings.json`, and
`report.md` under the workspace-root `.diagnostics/<conversation-id>/` directory. Run
`pnpm --filter @emi/api exec wrangler login` if neither environment credentials nor a Wrangler login
is available.

Exports redact tool inputs, outputs, health payloads, cookies, authorization values, OAuth material,
headers, and API keys by default. `--include-sensitive` is an explicit local-only opt-in; generated
files use owner-only filesystem permissions. `--output <directory>` selects another destination.

Signed-in owners can download the same versioned bundle from the conversation action or from
`GET /api/conversations/:id/diagnostics`. Repository ownership checks return `404` for a conversation
owned by another user. The endpoint never accepts a caller-supplied user id and responds with
`Cache-Control: private, no-store`.

Terminal generation history and its cascading chunks/events are retained for seven days by Worker
maintenance. Deleting a conversation deletes its generations, chunks, and events through foreign-key
cascades. Diagnostics are read-only and never replay tools.
