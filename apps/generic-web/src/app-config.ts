import type { ChatAppConfig } from "@emi/core/chat";

export const genericChatAppConfig = {
  name: "Core Chat",
  settingsStorageKey: "emi-core-chat-settings",
  version: "0.1.0",
  releaseNotes: ["Generic chat foundations are ready for application-specific extensions."],
} satisfies ChatAppConfig;
