# AI runtime decision

## Decision

Keep AI SDK for provider integration, model streaming, multi-step tool calls, UI message chunks, browser transport, and resumable stream interoperability.

Use Effect around it for schemas, errors, dependency injection, tool implementation, stream consumption, concurrency, persistence, HTTP routing, and Worker lifecycles. Keep XState as the frontend interaction-state owner.

Do not migrate to TanStack AI now.

## Why

TanStack AI has an attractive protocol-first design, AG-UI streams, typed isomorphic tools, connection adapters, middleware, and observability. It is a credible future option, not a weak library.

For this application, AI SDK remains the stronger long-term choice today:

- It is substantially more mature and has a much larger release and contributor history.
- The existing delayed-chunk, multi-step tool, persistence, disconnect, replay, and browser timing probes exercise its exact stream protocol.
- Its `UIMessageChunk`, `toUIMessageStream`, `DefaultChatTransport`, and `readUIMessageStream` form one supported end-to-end protocol.
- Its documented resumable-stream model matches the application's D1 checkpoint implementation.
- Replacing it would exchange a tested streaming boundary for TanStack AI's pre-1.0 API and require rewriting persisted chunk compatibility without removing the need for Effect or XState.

TanStack AI's isomorphic React tools are not a decisive benefit here because health-data tools must remain server-only. Effect Toolkit already provides one typed definition, runtime validation, implementation dispatch, and optional future MCP registration.

## Reconsider when

- TanStack AI reaches 1.0 with a stable AG-UI persistence and resume contract.
- The product needs client-executed tools or approval flows across several frontend frameworks.
- AG-UI interoperability with external agents becomes a product requirement.
- A production probe demonstrates materially better Cloudflare streaming behavior than the current AI SDK protocol.

Any future evaluation must first reproduce the delayed provider, tool loop, tee persistence, disconnect, resume, HTTP bridge, browser transport, and XState timing tests. Feature lists alone are not sufficient evidence.

## References

- [TanStack AI overview](https://tanstack.com/ai/latest/docs/getting-started/overview)
- [TanStack AI connection adapters](https://tanstack.com/ai/latest/docs/chat/connection-adapters)
- [AI SDK streamText](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)
- [AI SDK resumable streams](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams)
