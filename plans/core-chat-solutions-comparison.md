# @emi/core comparative landscape and gap analysis

Status: REFERENCE

Last reviewed: 2026-08-03

## Executive conclusion

`@emi/core` is already stronger than a typical chat UI starter at the lifecycle and
boundary level. It has an actor-owned client runtime, typed provider-neutral protocol
work, Effect-based server composition, explicit adapters, React/component tiers,
conversation lifecycle operations, attachments, memories, suggestions, web-search
capability work, authentication integration points, and a generic application with
substantial browser coverage.

The main gap is not another `sendMessage` helper. The comparable systems expose a
broader product model around a conversation:

- projects or workspaces with shared instructions, files, and memory;
- discoverable model and capability metadata;
- knowledge sources and retrieval pipelines, not only message attachments;
- first-class approvals, interrupts, resumable runs, and human-in-the-loop tools;
- artifacts, files, interactive or generative UI, and safe code execution;
- voice and other multimodal input/output;
- conversation search, collaboration, permissions, and organization features;
- long-running or scheduled work with notifications;
- traces, cost/usage data, evaluations, and operational feedback.

These should not all be placed in the generic package. The useful architectural
conclusion is a three-level product boundary:

1. Keep a small `@emi/core` kernel for protocol, runtime ownership, common React
   views, and capability contracts.
2. Put optional capabilities behind separate contracts and adapters, using Effect
   services/layers on the server and actor-owned state on the client.
3. Put product decisions such as team workspaces, billing, admin, scheduled jobs,
   and a particular RAG or voice vendor in flavor packages or applications.

## What is being compared

Codex is useful as a reference for an agent product, but it is not the fairest direct
peer: its primary unit is repository work performed through tools. ChatGPT is the
better closed-product benchmark for a general conversation platform. The open-source
comparators below cover the other relevant layers:

| Comparator                                                                                                            | Layer                                           | Why it matters                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ChatGPT Projects](https://help.openai.com/en/articles/10169521-chatgpt-projects) and the surrounding ChatGPT product | Closed end-user product                         | A useful benchmark for projects, files, memory, search, voice, canvas, research, and scheduled work.                                                  |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui)                                                          | Open-source React UI and runtime library        | A close comparison for thread state, branching, composer behavior, attachments, suggestions, speech, persistence adapters, and accessible components. |
| [Vercel AI SDK](https://github.com/vercel/ai) and [AI SDK UI](https://ai-sdk.dev/docs/ai-sdk-ui)                      | Open-source provider and streaming toolkit      | A comparison for provider-neutral model calls, tools, UI message streams, persistence, and framework adapters.                                        |
| [Open WebUI](https://docs.openwebui.com/features/)                                                                    | Open-source end-user chat application           | A mature product comparison for model switching, web search, memory, knowledge/RAG, folders, voice, image generation, and automation.                 |
| [LibreChat](https://github.com/danny-avila/LibreChat)                                                                 | Open-source end-user chat application           | A mature comparison for multiple providers, agents, MCP, code execution, artifacts, memory, search, and enterprise auth.                              |
| [CopilotKit](https://github.com/CopilotKit/CopilotKit) and its [reference API](https://docs.copilotkit.ai/reference)  | Open-source agentic UI and application protocol | A comparison for generative UI, shared state, human-in-the-loop, interrupts, thread management, and agent-facing UI contracts.                        |
| [ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex)                         | Agent-product reference                         | Useful for separating general chat capabilities from a tool-heavy coding-agent product. It is not a target API shape for `@emi/core`.                 |

The comparison is about capability shape and boundary design, not an assertion that
these projects have identical reliability, privacy, licensing, or implementation
quality. Product feature pages also describe capabilities that may require hosted
services, configuration, or paid plans.

## Capability matrix

The matrix uses these meanings:

- **Strong**: the capability is already a coherent part of the current generic core
  or generic application boundary.
- **Partial**: a related primitive exists, but the product-level contract or
  reusable adapter is incomplete.
- **Extension**: it belongs as a generic contract/adapter or flavor package, not as
  a mandatory dependency of the kernel.
- **Missing**: no first-class generic contract is currently apparent.
- **Deliberate**: it should remain outside generic core unless the product boundary
  changes.

| Capability                                                    | ChatGPT          | assistant-ui                                   | AI SDK                                     | Open WebUI                                  | LibreChat                        | CopilotKit                                                                                       | `@emi/core` assessment                                                                                                                 |
| ------------------------------------------------------------- | ---------------- | ---------------------------------------------- | ------------------------------------------ | ------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Conversation lifecycle, queueing, branching, archive/restore  | Strong           | Strong runtime primitives                      | Partial toolkit primitives                 | Strong                                      | Strong                           | Strong thread APIs                                                                               | **Strong**. Runtime actors and generic E2E cover the main lifecycle.                                                                   |
| Provider-neutral messages and streaming                       | Strong           | Runtime/adapter dependent                      | Strong UI message stream protocol          | App-specific                                | App-specific                     | AG-UI/agent dependent                                                                            | **Strong but still being hardened**. Keep provider types behind explicit adapters and advanced paths.                                  |
| Typed tools and tool result parts                             | Strong           | Generative UI/tool slots                       | Strong                                     | Strong                                      | Strong                           | Strong                                                                                           | **Partial**. The protocol and renderer slots exist, but a complete capability/approval model is not yet first-class.                   |
| Attachments and file parsing                                  | Strong           | Attachment adapter                             | Upload/message support                     | Strong                                      | Strong                           | Runtime dependent                                                                                | **Strong for chat attachments; partial for knowledge ingestion**.                                                                      |
| Suggestions and web search                                    | Strong           | Suggestion adapter; search is runtime-specific | Tool/provider dependent                    | Strong with citations                       | Strong                           | Suggestion/agent dependent                                                                       | **Partial-to-strong**. Generic flows exist, but provider capability discovery and a reusable cited-search contract need consolidation. |
| Model registry, capability discovery, and model switching     | Strong           | Runtime/application responsibility             | Provider abstraction, not product registry | Strong                                      | Strong                           | Agent/application responsibility                                                                 | **Partial**. Add a provider-neutral capability registry rather than exposing provider SDK metadata.                                    |
| Projects/workspaces and scoped instructions/files/memory      | Strong           | Thread primitives; application responsibility  | Not a product concern                      | Strong folders/knowledge/workspace features | Strong presets/agents/workspaces | Thread and shared state primitives                                                               | **Missing as a generic domain**. This is the largest product-model gap.                                                                |
| Conversation search, tags, folders, pagination                | Strong           | History/persistence adapters                   | Persistence is application-owned           | Strong                                      | Strong                           | Thread listing/search APIs                                                                       | **Partial**. Storage exists, but search/indexing and a stable cross-adapter contract are not a core capability.                        |
| Memory                                                        | Strong           | Adapter/application dependent                  | Application-owned                          | Strong                                      | Strong                           | Shared state/agent dependent                                                                     | **Partial-to-strong**. Generic memory exists; scope, retention, provenance, and project integration need a clearer contract.           |
| Knowledge bases, ingestion, chunking, vector/hybrid retrieval | Strong           | Application/adapter dependent                  | Not a product concern                      | Strong                                      | Strong                           | Backend/agent dependent                                                                          | **Missing in generic core; extension candidate**. Attachments are not a knowledge pipeline.                                            |
| Voice, speech input/output, audio/video interaction           | Strong           | Speech/voice adapters                          | Provider/tool dependent                    | Strong                                      | Runtime dependent                | **Missing as a generic capability; extension candidate**.                                        |
| Artifacts, canvas, editable files, generated documents        | Strong           | Generative UI primitives                       | Generative UI/tool primitives              | Strong                                      | Strong generative UI             | **Missing as a first-class core protocol**. Add a resource/artifact contract before adding a UI. |
| Code execution and sandboxed tools                            | Strong           | Tool/runtime dependent                         | Tool calls, not a sandbox                  | Strong                                      | Strong                           | Tool/agent dependent                                                                             | **Deliberately not in the kernel; extension candidate**. It requires an explicit isolation and trust model.                            |
| Human approval, interrupt, resume, delegated actions          | Strong           | Runtime/tool dependent                         | Tool calls; app owns approvals             | Product-specific                            | Agent/tool dependent             | Strong HITL/interrupt model                                                                      | **Partial**. Add typed approval and interruption events to the run protocol.                                                           |
| Long-running runs, cancellation, reconnect, replay            | Strong           | Runtime dependent                              | Streaming primitives                       | App-specific                                | App-specific                     | Stateful workflow dependent                                                                      | **Strong foundation, partial product guarantee**. Make run identity, event replay, and durable status explicit.                        |
| Scheduled tasks, automations, notifications                   | Strong           | Application-owned                              | Workflow/application-owned                 | Strong                                      | Product-specific                 | Workflow/application-owned                                                                       | **Missing; application or dedicated extension**. Do not add a scheduler to the kernel accidentally.                                    |
| Auth, guests, social providers, tenant boundaries             | Strong           | Application-owned                              | Application-owned                          | Strong                                      | Strong enterprise auth           | Application-owned                                                                                | **Partial**. Generic auth gates/integration exist; tenant, sharing, role, and retention contracts are not core-complete.               |
| Sharing, collaboration, permissions, realtime presence        | Strong           | Application-owned                              | Application-owned                          | Product-specific                            | Product-specific                 | Shared state primitives                                                                          | **Missing as a generic product capability; likely flavor/application**.                                                                |
| Traces, token/cost usage, feedback, evaluations               | Strong           | Feedback adapter                               | Usage/tool telemetry dependent             | Product-specific                            | Product-specific                 | Agent observability dependent                                                                    | **Partial**. Add provider-neutral run metadata and observability ports; keep vendor exporters outside core.                            |
| MCP, AG-UI, and external agent interoperability               | Product-specific | Runtime adapters                               | Provider/tool adapters                     | Product-specific                            | MCP support                      | AG-UI-oriented                                                                                   | **Extension candidate**. The core should define stable adapter seams, not absorb every protocol.                                       |
| Accessible, responsive chat components                        | Strong           | Strong                                         | AI Elements/components                     | Product-specific                            | Product-specific                 | Generative UI components                                                                         | **Strong**. Preserve the component tiers and keep React as a view over actor state.                                                    |

## What the comparators show

### ChatGPT: the product-model benchmark

ChatGPT’s current product surface makes a conversation more than a message list.
Projects group chats, files, and custom instructions, and can use capabilities such as
web search, image generation, voice, and study mode; project memory and chat search
extend the scope beyond one thread. See [Projects in ChatGPT](https://help.openai.com/en/articles/10169521-chatgpt-projects).

The surrounding product also establishes useful capability benchmarks:

- [File uploads](https://help.openai.com/en/articles/8555545-uploading-images-and-files-in-chatgpt)
  cover extraction, transformation, and synthesis over common document formats.
- [Voice mode](https://help.openai.com/en/articles/20001274/) treats voice as a
  conversation modality rather than a separate toy UI.
- [Canvas](https://help.openai.com/en/articles/9930697-what-is-canvas) provides an
  editable writing/code workspace with selection, revisions, and execution-oriented
  affordances.
- [Deep research](https://help.openai.com/en/articles/10500283-deep-research-faq)
  models source selection, planning, progress, interruption, and a cited report as
  one long-running run.
- [Scheduled tasks](https://help.openai.com/en/articles/6825453-chatgpt-usage-limits)
  show that recurring work and notifications are a separate lifecycle from a live
  request/response chat.

The lesson for `@emi/core` is not to reproduce ChatGPT wholesale. It is to model
scope, runs, resources, and capabilities explicitly enough that these features can be
added without changing the message protocol or leaking a provider into common code.

### assistant-ui: the closest UI/runtime comparison

The [assistant-ui architecture](https://www.assistant-ui.com/docs/architecture)
separates primitives and prebuilt components from runtime ownership. Its runtime
concepts include messages, threads, composer state, runs, branching, editing,
regeneration, and adapter slots for attachments, history, speech, feedback, and
suggestions. Its [custom runtime](https://www.assistant-ui.com/docs/runtimes/custom/overview)
shows how those concerns can be supplied by REST or another external runtime.

This validates several current `@emi/core` decisions:

- React should remain a view over a stateful runtime.
- composer, thread, message part, attachment, and suggestion concerns need separate
  discoverable domains.
- adapters are more useful than a large provider-shaped component API.

It also highlights a gap: the core needs a similarly explicit capability/adapter
contract for history search, speech, approvals, artifacts, and external agent
protocols, not just a collection of chat-specific operations.

### Vercel AI SDK: the streaming/provider comparison

The [AI SDK UI documentation](https://ai-sdk.dev/docs/ai-sdk-ui) covers chatbot
state, persistence, tool usage, streaming, UI message streams, and error handling.
The [AI SDK project](https://vercel.com/ai-sdk) also spans model/provider APIs,
UI hooks, components, gateways, and workflow-oriented tooling.

AI SDK is therefore a useful lower-level interoperability target, but not a complete
domain model for `@emi/core`. It gives us a strong reference for wire streaming and
provider adapters; it does not by itself answer project/workspace scope, permissions,
knowledge ingestion, approval durability, or product search.

The comparison reinforces an existing boundary decision: AI SDK types may exist in
the explicit adapter/advanced surface, but provider-neutral protocol and common server
contracts should not be defined by them.

### Open WebUI and LibreChat: the self-hosted product comparison

[Open WebUI’s feature documentation](https://docs.openwebui.com/features/) lists
model switching, attachments, web search with citations, code execution, memory,
folders/tags/pins, voice/audio, image generation, automations, task management, and
knowledge/RAG features. Its [conversation documentation](https://docs.openwebui.com/features/chat-conversations/)
also makes per-chat capability toggles and cited web search visible as product-level
concepts.

[LibreChat’s feature documentation](https://www.librechat.ai/docs/features) and
[repository](https://github.com/danny-avila/LibreChat) show a similar breadth:
multiple providers, agents, MCP, code execution, multimodal chat, artifacts, memory,
web search, message search, and enterprise authentication.

These products expose the most important missing product domains for `@emi/core`:
knowledge sources, model metadata, artifact/resource output, agent tools, and
organization/auth boundaries. They also show why those domains need capability
packages: each one has different trust, storage, indexing, and deployment costs.

### CopilotKit: the agentic UI and HITL comparison

[CopilotKit](https://docs.copilotkit.ai/) treats chat as part of an agentic UI with
generative UI, shared state, streaming, and human-in-the-loop interaction. Its
[reference API](https://docs.copilotkit.ai/reference) includes agent context,
capabilities, tools, interrupts, rendering, suggestions, and thread listing,
renaming, archiving, deletion, pagination, and realtime behavior.

This is the clearest signal that an approval or interrupt is not merely a UI boolean.
It should be a typed run event with an identity, requested action, policy context,
expiration/cancellation behavior, and a durable resume path. That contract can fit
our Effect/Stream server model and XState actor client model without importing
CopilotKit itself.

## Current strengths in `@emi/core`

The comparison should not obscure what is already unusually good for a generic chat
package:

- `createChatRuntime` and the React/provider/component surfaces give common consumers
  a framework-facing entry point while keeping XState behind the runtime boundary.
- The protocol and contract work is intentionally provider-neutral, with explicit
  advanced/provider paths for AI SDK and XState access.
- Effect services, layers, typed errors, and server streams provide a credible base
  for the server/use-case/composition side of the system.
- Conversation lifecycle behavior is broader than a minimal chat starter: temporary
  chats, queueing, fork/compact, archive/restore, attachments, memories, suggestions,
  web-search capability work, and replay/persistence are represented in the generic
  application and tests.
- The component tiers and generic-web app demonstrate that the rich UI can be composed
  without making every consumer understand core’s file layout or internal engines.
- Explicit package exports, consumer fixtures, boundary checks, anti-slop rules, and
  browser/API coverage provide stronger contract discipline than most starter kits.

The next improvements should build on these boundaries instead of replacing the
runtime with React state, introducing an untyped event bus, or putting every product
feature in the root package.

## Highest-value gaps to address

### 1. A capability registry and model descriptor contract

The core needs a provider-neutral description of what a configured model/runtime can
do. It should answer questions such as:

- Can this model stream, call tools, accept images/files, produce structured output,
  use web search, or participate in voice?
- Which attachment kinds, message parts, tools, and approval policies are supported?
- Which limits and usage metadata should the UI display?
- Which capabilities are enabled for this tenant, project, or conversation?

This should be a small protocol/domain contract with adapters for AI SDK, OpenAI-
compatible providers, local models, or HealthFit. It should not export raw provider
model objects or SDK capability types.

### 2. Project/workspace/session scope

A thread alone is too narrow for shared instructions, files, memories, model defaults,
retention policy, and future collaboration. Define the scope relationships before
adding more UI:

```text
tenant or user
  -> workspace/project
       -> conversation/thread
            -> run/generation
                 -> message/part/resource
```

The first version can be single-user and local, but the identifiers and ports should
not make sharing impossible later. Project/workspace state belongs in a generic
contract only if we want `@emi/core` to be a reusable platform kernel; otherwise it
should start as a flavor package with a core extension seam.

### 3. First-class run events, approvals, and interrupts

The current stream and actor foundations should be extended into a canonical run
protocol. At minimum, it needs typed events for started, progress, message part,
tool requested, approval requested, approval resolved, interrupted, failed, completed,
cancelled, and replay boundary.

An approval request should include an operation identity, a typed action summary,
policy or scope information, expiration, and a deterministic resume/cancel result.
Effect errors should remain tagged and yieldable; the client should observe the event
stream through the actor rather than inventing a second state machine in React.

### 4. Resource and artifact parts

Messages currently carry chat-oriented parts. The next durable abstraction should be a
provider-neutral resource/artifact reference that can represent a generated document,
editable code/text file, image/audio asset, citation bundle, or structured UI payload.
It needs:

- stable identity and versioning;
- MIME/type and size metadata;
- ownership and access scope;
- storage/download ports rather than a platform-specific URL assumption;
- safe renderer/extension registration;
- explicit persistence and deletion semantics.

This is the seam needed for Canvas-like behavior, generative UI, export, and
knowledge-source ingestion without coupling the protocol to one UI implementation.

### 5. Knowledge-source and retrieval contracts

Attachments are transient inputs; knowledge bases are indexed resources with lifecycle,
provenance, permissions, refresh, deletion, and retrieval behavior. The core should
define only the stable contract if generic knowledge is a product goal:

- source registration and status;
- ingestion/re-ingestion and deletion;
- chunk/citation provenance;
- query and bounded result shape;
- tenant/project access scope;
- optional vector, keyword, or hybrid adapters.

Embedding vendors, vector stores, parsers, and ranking algorithms belong in adapters or
flavor packages. Do not put D1 rows, AI SDK document types, or a particular vector
database in the common protocol.

### 6. Searchable conversation history

The existing conversation stores need a deliberate search/indexing port rather than
making every UI or adapter scan raw messages. Start with an Effect service contract
for bounded, permission-aware queries and cursors. Full-text, semantic, and external
search implementations can remain separate adapters.

### 7. Operational run metadata and feedback

A reusable chat platform needs a provider-neutral way to expose run ID, model ID,
attempt, latency, token/usage estimates, retry/cancellation reason, tool duration,
citations, and user feedback. Exporters for OpenTelemetry, Sentry, vendor tracing, and
analytics should be optional. This is also the foundation for evaluations and reliable
browser assertions about failures, not only rendered text.

## Recommended placement

| Proposed capability                           | Kernel protocol                    | Optional core extension       | Flavor/application                    |
| --------------------------------------------- | ---------------------------------- | ----------------------------- | ------------------------------------- |
| Message parts, run identity, typed run events | Yes                                |                               |                                       |
| Runtime actor and React view boundary         | Yes                                |                               |                                       |
| Model/capability descriptor                   | Small contract                     | Provider adapters             |                                       |
| Approval/interrupt/resume                     | Small contract                     | Policy and tool adapters      | Product-specific approval UI          |
| Artifacts/resources                           | Small contract                     | Storage and renderer adapters | Canvas/editor product                 |
| Conversation search                           | Port and DTOs                      | Search adapters               | Index operations/UX                   |
| Knowledge/RAG                                 |                                    | Contract package              | Parsers, embeddings, vector store, UX |
| Voice/speech                                  |                                    | Contract and adapters         | Recording UX, quotas, provider setup  |
| MCP/AG-UI/external agents                     |                                    | Protocol adapters             | Product-specific agent catalog        |
| Code execution                                |                                    | Sandboxed adapter contract    | Sandbox infrastructure and policy     |
| Projects/workspaces                           | Maybe identifiers/scope primitives | Generic project package       | Sharing, roles, billing, admin        |
| Scheduled work/notifications                  |                                    |                               | Application or job platform           |
| Team collaboration/presence                   |                                    |                               | Application                           |

This placement keeps the common package discoverable and testable. It also leaves room
for a HealthFit package to add fitness context, Discord, Hevy, and sport-specific
behavior without changing generic protocol names.

## Architecture consequences

The comparison supports the current direction, with a few explicit follow-ups:

1. Keep XState as the internal client actor engine. Components subscribe to actor-owned
   snapshots and send typed intents; they do not own a parallel copy of conversation,
   run, approval, or stream state.
2. Keep Effect as the server/use-case/composition engine. New run, approval, search,
   artifact, and knowledge workflows should be Effect programs with tagged errors,
   services, layers, and streams where the lifecycle is streaming or interruptible.
3. Derive Promise conveniences from the Effect-first implementation at package
   boundaries. Do not make Promise orchestration the canonical implementation and then
   wrap it with `Effect.tryPromise` or untyped error recovery.
4. Use ports for capability contracts and adapters for platform/provider details. Split
   ports by testable responsibility; a concrete adapter may implement several ports,
   but a use case should require only the narrow services it consumes.
5. Keep AI SDK, D1, Cloudflare, authentication SDKs, and provider model objects behind
   explicit adapter or advanced subpaths. Do not let comparison-driven features reopen
   the generic protocol boundary.
6. Treat long-running work as a run with identity and events, not as a Promise hidden
   behind a route. This is the common denominator between streaming chat, approvals,
   research, tool execution, and scheduled work.

## What we should not copy

The following are intentionally not immediate `@emi/core` requirements:

- a monolithic self-hosted application with every provider, admin page, and deployment
  mode bundled into the kernel;
- provider-specific model configuration in common protocol types;
- a generic “execute arbitrary code” feature without an explicit sandbox, quota, audit,
  and approval model;
- a second client state engine in React or a global untyped event emitter;
- dynamic wildcard registries that make exports and dependencies undiscoverable;
- a product-specific workspace, billing, or social graph in provider-neutral core;
- every current ChatGPT feature before the core’s run/resource/capability seams are
  stable.

The open-source products are useful as capability inventories, not as a reason to
duplicate their entire application scope.

## Suggested next packets

These are recommendations for future planning, not an instruction to start all of them
in one packet.

### Packet C1 — capability and run contract

Define provider-neutral model/capability descriptors, canonical run identity, run
events, approval requests, interrupt/resume semantics, and observability metadata.
Add protocol fixtures first, then Effect services and actor integration.

### Packet C2 — resource/artifact contract

Define resource identity, versioning, storage ports, artifact message parts, citations,
and renderer/extension slots. Add a minimal generated-text/file fixture without adding
a full Canvas product.

### Packet C3 — project and conversation search boundary

Decide whether projects/workspaces are generic core or a separate package. Then add
scoped conversation history and search ports with cursor pagination and authorization
semantics.

### Packet C4 — optional capability adapters

Choose one or two based on product demand: knowledge/RAG, speech, MCP/AG-UI, or a
sandboxed tool runner. Each should be its own contract/adapter packet with explicit
trust and lifecycle tests.

### Packet C5 — product-level features

Only after the contracts settle: project UI, artifact editor, voice UX, scheduled work,
sharing, permissions, admin, and notifications in the appropriate application or
flavor package.

## Questions for later discussion

1. Is the long-term target a reusable chat platform kernel, a generic chat starter, or
   both through a small kernel plus optional capability packages?
2. Do projects/workspaces need to be part of generic core now, or should the first
   implementation live in the generic application and prove its shape before promotion?
3. Should artifacts/resources and approvals be promoted to the next core protocol
   packet, ahead of knowledge/RAG and voice?
4. Do we want MCP and AG-UI as named first-class adapters, or only a generic external
   agent adapter until a concrete consumer requires them?
5. What reconnect and durability guarantee do we want for runs across worker restarts:
   best-effort replay, durable replay, or a product-specific guarantee?
6. Is conversation search a required generic capability, or can it remain an adapter
   owned by applications until a second consumer needs it?
7. Which usage, trace, feedback, and evaluation fields must be stable in the protocol
   before we choose an observability backend?

## Sources

All links were reviewed on 2026-08-03.

### Closed-product benchmarks

- [Projects in ChatGPT](https://help.openai.com/en/articles/10169521-chatgpt-projects)
- [Uploading images and files in ChatGPT](https://help.openai.com/en/articles/8555545-uploading-images-and-files-in-chatgpt)
- [ChatGPT Voice](https://help.openai.com/en/articles/20001274/)
- [What is the canvas feature in ChatGPT?](https://help.openai.com/en/articles/9930697-what-is-canvas)
- [Deep research FAQ](https://help.openai.com/en/articles/10500283-deep-research-faq)
- [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-usage-limits)
- [ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex)

### Open-source libraries and applications

- [assistant-ui architecture](https://www.assistant-ui.com/docs/architecture)
- [assistant-ui custom runtimes](https://www.assistant-ui.com/docs/runtimes/custom/overview)
- [assistant-ui adapters](https://www.assistant-ui.com/docs/runtimes/concepts/adapters)
- [assistant-ui repository](https://github.com/assistant-ui/assistant-ui)
- [Vercel AI SDK UI](https://ai-sdk.dev/docs/ai-sdk-ui)
- [Vercel AI SDK](https://vercel.com/ai-sdk)
- [Vercel AI SDK repository](https://github.com/vercel/ai)
- [Open WebUI features](https://docs.openwebui.com/features/)
- [Open WebUI chat and conversations](https://docs.openwebui.com/features/chat-conversations/)
- [Open WebUI model workspace](https://docs.openwebui.com/features/workspace/models/)
- [LibreChat features](https://www.librechat.ai/docs/features)
- [LibreChat agents](https://www.librechat.ai/docs/features/agents)
- [LibreChat repository](https://github.com/danny-avila/LibreChat)
- [CopilotKit documentation](https://docs.copilotkit.ai/)
- [CopilotKit reference](https://docs.copilotkit.ai/reference)
- [CopilotKit repository](https://github.com/CopilotKit/CopilotKit)
