import * as Schema from "effect/Schema";

const nonEmptyText = Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/));

export const ChatAppConfigSchema = Schema.Struct({
  name: nonEmptyText,
  settingsStorageKey: nonEmptyText,
  version: nonEmptyText,
  releaseNotes: Schema.Array(Schema.String),
});

export const ChatSettingsDescriptorSchema = Schema.Struct({
  storage: Schema.Literal("local"),
  key: nonEmptyText,
  apiKey: Schema.Literal("browser-only"),
});

export const ChatReleaseSchema = Schema.Struct({
  version: nonEmptyText,
  releasedAt: Schema.optional(Schema.String),
  buildId: Schema.optional(Schema.String),
  commitId: Schema.optional(Schema.String),
  changeId: Schema.optional(Schema.String),
  changes: Schema.Array(Schema.String),
});

export const ChatReleaseHistorySchema = Schema.Struct({
  releases: Schema.Array(ChatReleaseSchema),
});

export type ChatAppConfig = typeof ChatAppConfigSchema.Type;
export type ChatSettingsDescriptor = typeof ChatSettingsDescriptorSchema.Type;
export type ChatRelease = typeof ChatReleaseSchema.Type;
export type ChatReleaseHistory = typeof ChatReleaseHistorySchema.Type;

export const defaultChatAppConfig: ChatAppConfig = {
  name: "Core Chat",
  settingsStorageKey: "emi-core-chat-settings",
  version: "0.1.0",
  releaseNotes: [],
};
