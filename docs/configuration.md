# Core chat configuration

## App identity

`ChatAppConfig` is the public metadata contract used by the styled recipe and Worker metadata
routes:

```ts
const appConfig = {
  name: "My Chat",
  settingsStorageKey: "my-chat-settings",
  version: "0.1.0",
  releaseNotes: ["Initial release"],
};
```

The settings descriptor reports `storage: "local"` and `apiKey: "browser-only"`. The generic
runtime never sends settings to a persistence adapter unless the application explicitly includes
them in its request-body adapter.

## Runtime inputs

`createChatRuntime` requires injected transport, settings/draft storage, browser online state, and
identity providers. It optionally accepts a typed `ConversationClient`, custom stream/error/message
adapters, request-body mapping, WebMCP capability, extensions, and feature flags.

The runtime owns conversation selection, threads, streaming, reconnect, stop, retry, queued
follow-ups, attachments, memories, settings, draft persistence, and online/offline state. React
should subscribe through `useChatSelector` and issue commands through `useChatActions`.

The default settings are:

| Field | Default | Ownership |
| --- | --- | --- |
| `provider` | `openai` | local runtime settings |
| `apiKey` | empty | browser-local; never public API metadata |
| `baseUrl` | empty | browser-local provider endpoint |
| `model` | `gpt-4o-mini` | local default for new requests |
| `systemPrompt` | empty | local request setting |
| `titleModel` / `memoryModel` | `gpt-4o-mini` | local optional model settings |
| `memoryEnabled` | `true` | local feature setting |
| `webSearch` | `false` | local capability toggle |
| `theme` | `light` | local presentation setting |

Persisted settings are decoded with `PersistedGenericChatSettingsSchema`; invalid stored values
fall back to defaults. Attachments are limited to ten files, five megabytes per file, and supported
PNG, JPEG, WebP, or GIF image formats.

## Environment

The generic Worker needs `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AUTH_APP_NAME`, and
`ALLOW_DEMO_USER_HEADER`. The generic web app uses `VITE_API_ORIGIN` for a separately hosted
Worker, `VITE_WORKER_ORIGIN` for its local Vite proxy, and the opt-in `VITE_WEBMCP_ENABLED` flag.
Keep secrets in an ignored app-specific environment file; never put API keys or origin-trial tokens
in source or versioned examples.

HealthFit adds its own Google, Hevy, OpenAI, Discord, and release environment variables. Those are
application concerns and are not part of the generic core configuration.
