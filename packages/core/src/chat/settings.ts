import * as Schema from "effect/Schema";

export const GenericChatSettingsSchema = Schema.Struct({
  provider: Schema.Literal("openai"),
  apiKey: Schema.String,
  baseUrl: Schema.String,
  model: Schema.String,
  systemPrompt: Schema.String,
  titleModel: Schema.String,
  titlePrompt: Schema.String,
  memoryEnabled: Schema.Boolean,
  memoryModel: Schema.String,
  webSearch: Schema.Boolean,
  theme: Schema.Literals(["light", "dark"]),
});

export const PersistedGenericChatSettingsSchema = Schema.Struct({
  provider: Schema.Literal("openai"),
  apiKey: Schema.String,
  baseUrl: Schema.String,
  model: Schema.String,
  systemPrompt: Schema.String,
  titleModel: Schema.String,
  titlePrompt: Schema.String,
  memoryEnabled: Schema.Boolean,
  memoryModel: Schema.String,
  webSearch: Schema.optional(Schema.Boolean),
  theme: Schema.Literals(["light", "dark"]),
});

export type GenericChatSettings = typeof GenericChatSettingsSchema.Type;

export const defaultGenericChatSettings: GenericChatSettings = {
  provider: "openai",
  apiKey: "",
  baseUrl: "",
  model: "gpt-4o-mini",
  systemPrompt: "",
  titleModel: "gpt-4o-mini",
  titlePrompt: "",
  memoryEnabled: true,
  memoryModel: "gpt-4o-mini",
  webSearch: false,
  theme: "light",
};
