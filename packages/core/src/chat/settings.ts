import * as Schema from "effect/Schema";

const ThemeSchema = Schema.Literals(["light", "dark"]);

export const GenericChatSettingsSchema = Schema.Struct({
  provider: Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/)),
  apiKey: Schema.String,
  baseUrl: Schema.String,
  model: Schema.String,
  systemPrompt: Schema.String,
  titleModel: Schema.String,
  titlePrompt: Schema.String,
  memoryEnabled: Schema.Boolean,
  memoryModel: Schema.String,
  webSearch: Schema.Boolean,
  showTokenUsage: Schema.Boolean,
  theme: ThemeSchema,
});

export const PersistedGenericChatSettingsSchema = Schema.Struct({
  provider: Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/)),
  apiKey: Schema.String,
  baseUrl: Schema.String,
  model: Schema.String,
  systemPrompt: Schema.String,
  titleModel: Schema.String,
  titlePrompt: Schema.String,
  memoryEnabled: Schema.Boolean,
  memoryModel: Schema.String,
  webSearch: Schema.optional(Schema.Boolean),
  showTokenUsage: Schema.optional(Schema.Boolean),
  theme: Schema.optional(ThemeSchema),
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
  showTokenUsage: false,
  theme: "light",
};
