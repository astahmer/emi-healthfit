# @emi/core

Reusable chat primitives for building browser clients, server workflows, provider adapters,
and platform integrations. The package keeps common consumers on explicit capability
subpaths, so React, XState, AI SDK, database, and platform dependencies stay opt-in.

## Quick start

```sh
pnpm add @emi/core
```

```tsx
import { createChatRuntime } from "@emi/core";
import { ChatProvider } from "@emi/core/react";
import { ChatApp } from "@emi/core/components/styled";
import "@emi/core/styles.css";

const runtime = createChatRuntime({
  transport: { baseUrl: "/api", fetch },
  storage: { settings, drafts },
  browser: { online, subscribeOnline },
  identity: { createId, now },
  features: { attachments: true, memories: true, branches: true },
});

root.render(
  <ChatProvider runtime={runtime}>
    <ChatApp />
  </ChatProvider>,
);
```

## Features

| Feature             | Import                          | What it provides                                                                                                          |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Core runtime        | `@emi/core`                     | `createChatRuntime` plus provider-neutral chat state and protocol types.                                                  |
| Protocol            | `@emi/core/protocol`            | Messages, parts, resources, models, IDs, errors, schemas, and extension contracts.                                        |
| API client          | `@emi/core/api`                 | Generic HTTP DTOs and `CoreApiClient` for conversations and messages.                                                     |
| Chat operations     | `@emi/core/chat`                | Provider-bound settings, app configuration, streaming, message conversion, generation, memory, attachment, and tool APIs. |
| API contract        | `@emi/core/contract`            | Generic HTTP schemas and `CoreApi` composition for conversations, notes, memories, suggestions, and links.                |
| Cloudflare boundary | `@emi/core/cloudflare`          | Cloudflare auth, database, and route adapters.                                                                            |
| Discord integration | `@emi/core/discord`             | Discord interaction types, request and response builders, and signature verification.                                     |
| Runtime facade      | `@emi/core/runtime`             | Actor-backed runtime, selectors, commands, lifecycle, subscriptions, and optional WebMCP registration.                    |
| React integration   | `@emi/core/react`               | `ChatProvider`, `useChatRuntime`, `useChatActions`, and `useChatSelector`.                                                |
| UI primitives       | `@emi/core/components`          | Controlled and connected `Composer`, `Thread`, `Message`, `Sidebar`, `ConversationList`, and `Dialog` components.         |
| Styled UI recipes   | `@emi/core/components/styled`   | Opt-in connected recipes such as `ChatApp` and `ChatShell`.                                                               |
| Browser features    | `@emi/core/web`                 | Generic browser views, attachment and URL policy, thread views, auth sessions, and WebMCP detection.                      |
| Styles              | `@emi/core/styles.css`          | Opt-in design tokens and structural styles for core UI components.                                                        |
| Chat server         | `@emi/core/server`              | Generic `ChatServer`, conversation search, memory tools, ports, and typed use cases.                                      |
| Effect server layer | `@emi/core/server/effect`       | Effect-native `ChatServerEffect` service and live layer.                                                                  |
| Fetch handlers      | `@emi/core/server/fetch`        | Fetch `Request`/`Response` handlers derived from typed server effects.                                                    |
| Database layer      | `@emi/core/server/database`     | Advanced SQL schemas, persistence domains, and replay helpers.                                                            |
| Tool schemas        | `@emi/core/server/tool-schema`  | Server tool definitions and schema extraction.                                                                            |
| AI SDK adapter      | `@emi/core/adapters/ai-sdk`     | Bridge from AI SDK/provider streams to the provider-neutral model interface.                                              |
| Cloudflare adapter  | `@emi/core/adapters/cloudflare` | Cloudflare, D1, R2, and Worker-binding repository implementations.                                                        |
| Extensions          | `@emi/core/extensions`          | Collision-checked `ChatExtensions` composition for product capabilities.                                                  |
| Testing utilities   | `@emi/core/testing`             | Deterministic in-memory repositories, dependencies, and actor harnesses.                                                  |
| XState integration  | `@emi/core/advanced/xstate`     | Explicit access to actor references, machine integration, and advanced XState utilities.                                  |

## Boundaries

The common client path is deliberately small:

- `@emi/core` for runtime creation and core types
- `@emi/core/react` for React bindings
- `@emi/core/components` or `@emi/core/components/styled` for UI
- `@emi/core/styles.css` for opt-in styles

Use server, adapter, database, Cloudflare, Discord, AI SDK, and XState entrypoints only when
those capabilities are part of the application. Common protocol, runtime, React, and component
imports do not require consumers to compose Effect, XState, AI SDK, D1, Drizzle, or Cloudflare.

See [`PUBLISH.md`](./PUBLISH.md) for the complete public API catalog, dependency matrix,
distribution rules, and architecture boundaries.
