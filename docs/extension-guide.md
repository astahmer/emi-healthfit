# Extending the core chat platform

Use `@emi/core` for the common chat runtime, protocol, persistence, and styled recipe. Keep
product behavior in a named composition package or application. The core package must never import
HealthFit, Hevy, fitness, or product-specific UI.

## Browser composition

The smallest complete composition is:

```tsx
import { createChatRuntime } from "@emi/core";
import { ChatApp } from "@emi/core/components/styled";
import { ChatProvider } from "@emi/core/react";

const runtime = createChatRuntime({
  transport: { baseUrl: "/api", fetch },
  storage: { settings, drafts },
  browser: { online: navigator.onLine, subscribeOnline },
  identity: { createId, now },
});

<ChatProvider runtime={runtime}>
  <ChatApp appName="My Chat" />
</ChatProvider>;
```

Use `@emi/core/components` for controlled primitives or `@emi/core/web` for thread, attachment,
markdown, and dynamic-component helpers. React views read selectors and dispatch actions through
the runtime facade; they do not own stream, persistence, queue, or browser lifecycle state.

## Contributions

`CoreWebProvider` accepts navigation pages, tool renderers, and validated dynamic-component
renderers. `AppDefinitions` composes identity, prompt contributors, and tool definitions on the
server. `ChatExtensions.define` validates namespaced parts, tools, and navigation JSON, and
`ChatExtensions.compose` rejects duplicate ids, namespaces, and contribution names.

```ts
const extension = yield* ChatExtensions.define({
  id: "acme.weather",
  namespace: "acme.weather.chat",
  parts: { "acme.weather.chat.forecast": ForecastSchema },
  tools: { forecast: ForecastToolSchema },
});
```

Dynamic components are declarative envelopes. Decode and registry-check them before rendering;
invalid, cyclic, or unregistered elements render a safe fallback. Model output never supplies
executable component code.

HealthFit composes its prompts, tools, routes, pages, and workout renderers through
`@emi/flavor-healthfit` and `CoreWebProvider`. A generic app should use its own contribution
package and should not copy imports from `apps/chat` or `apps/api`.

## Server contributions

Use the generic Cloudflare route factories from `@emi/core/cloudflare` for conversations, memory,
threads, suggestions, streaming, and replay. Supply the database and an app config; bind auth and
provider credentials at the Worker edge. If an app needs provider-specific UI-message replay or
tool execution, keep that adapter in the app's named chat domain and make the provider boundary
explicit.
