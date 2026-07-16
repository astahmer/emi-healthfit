# Durable chat execution implementation session prompt

Implement `plans/durable-chat-execution.md` as one migration task. Read `AGENTS.md`, the entire plan,
current generation persistence/stream/resume code, Alchemy resources, and focused chat tests before
changing behavior.

Add the generation Durable Object and move single-generation coordination, provider streaming, tool
execution, bounded D1 chunk checkpointing, live fan-out, reconnect, terminal failure, and alarm recovery
into it while preserving current HTTP routes and `DefaultChatTransport` contracts. D1 remains durable
history; the object owns active execution and connection coordination.

Make migration incremental behind a reversible configuration path. Do not remove the existing
`waitUntil` path until progressive streaming, refresh resume, editing/regeneration, tool loops,
retention, two-tab deduplication, browser disconnect, and object-restart tests pass through the new path.
Avoid a ten-minute ambiguous running state after interruption.

Use multiple coherent JJ revisions for resources/schema, object execution, transport/reconnect,
recovery/alarms, cutover, and cleanup. Preserve unrelated work. Run focused termination tests during
development and all checks required by `AGENTS.md` at the end. Update the plan and report revision ids,
failure semantics, measured stream timing, and rollback instructions.
