import * as Schema from "effect/Schema";

export const GenericChatSettingsSchema = Schema.Struct({
  provider: Schema.Literal("openai"),
  apiKey: Schema.String,
  baseUrl: Schema.String,
  model: Schema.String,
  systemPrompt: Schema.String,
  titleModel: Schema.String,
  titlePrompt: Schema.String,
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
};
