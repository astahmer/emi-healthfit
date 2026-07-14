# Durable chat execution

## Context

Chat generations currently continue under Worker `waitUntil`, persist UI chunks to D1, and resume through `/api/chat/:conversationId/stream`. This survives browser navigation and disconnects, but `waitUntil` is not a durable execution guarantee. A Worker termination can leave a generation marked running until stale-generation expiry converts it to a resumable timeout error.

## Decision

Use a Durable Object per active conversation generation as the next execution owner.

- A Durable Object can serialize concurrent submissions, retain live stream subscribers, persist checkpoints, and recover through alarms.
- Keep D1 as durable conversation history and completed-generation replay storage.
- Keep AI SDK for provider streaming and UI message conversion.
- Keep Effect for orchestration, typed failures, retries, schedules, and resource lifetimes inside the Worker and Durable Object.
- Do not use Queues as the primary owner because they cannot provide an interactive response stream.
- Re-evaluate Cloudflare Workflows only if generation becomes a long, step-oriented background job where live token streaming is secondary.

## Migration steps

1. Add a generation Durable Object binding and Alchemy resource.
2. Move the single-running-generation invariant from a D1 unique index race to the object instance.
3. Send the validated request and persisted-history cursor to the object.
4. Run `streamText` and tool execution inside the object.
5. Broadcast UI chunks to connected responses while checkpointing them to D1 in bounded batches.
6. Reconnect browsers to the object while active and fall back to D1 replay after completion.
7. Use an alarm to mark interrupted generations failed and emit a terminal replay chunk.
8. Preserve the current HTTP routes and `DefaultChatTransport` contract during migration.
9. Add termination tests that recreate the object between provider chunks.
10. Remove generation `waitUntil` only after progressive streaming, resume, and persistence tests pass through the object path.

## Metrics

Retain the current structured events for provider TTFC, inter-chunk latency, tool duration, reconnects, failures, abandoned generations, and browser/XState arrival. Add object restarts, active subscribers, checkpoint batch duration, and alarm recovery latency.

## Acceptance criteria

- Closing every browser does not stop a generation.
- Worker or object restart either resumes execution or records a terminal failure without a ten-minute ambiguous running state.
- Two tabs receive the same generation without starting duplicate provider work.
- Provider chunks remain progressive through the direct Worker URL and frontend proxy.
- D1 replay, refresh resume, tool loops, editing/regeneration, and retention cleanup continue to work.
