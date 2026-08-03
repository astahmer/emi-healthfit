import type { ChatAppConfig } from "@emi/core/chat";

export const genericWorkerAppConfig = {
  name: "Core Chat",
  databaseName: "GenericData",
  settingsStorageKey: "emi-core-chat-settings",
  version: "0.1.0",
  releaseNotes: ["Generic chat foundations are ready for application-specific extensions."],
} satisfies ChatAppConfig & { databaseName: string };
