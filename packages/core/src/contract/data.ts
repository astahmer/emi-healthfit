import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { Content, StandardErrors } from "./common.ts";

export const ModelClientConfiguration = Schema.Struct({
  apiKey: Content,
  baseUrl: Schema.optional(Schema.String),
  model: Schema.String,
});

export class SuggestionsApi extends HttpApiGroup.make("suggestions")
  .add(
    HttpApiEndpoint.post("generate", "/suggestions", {
      payload: Schema.Struct({
        threadId: Schema.optional(Schema.String),
        messageId: Schema.optional(Schema.String),
        lastAssistantText: Content,
        lastUserText: Schema.optional(Schema.String),
        config: ModelClientConfiguration,
      }),
      success: Schema.Struct({ suggestions: Schema.Array(Schema.String) }),
      error: StandardErrors,
    }),
  )
  .prefix("/api") {}

export class MemoriesExtraApi extends HttpApiGroup.make("memoryExtraction")
  .add(
    HttpApiEndpoint.post("extract", "/memories/extract", {
      payload: Schema.Struct({
        text: Content,
        threadId: Schema.optional(Schema.String),
        messageId: Schema.optional(Schema.String),
        source: Schema.optional(Schema.Literals(["auto", "manual"])),
        config: ModelClientConfiguration,
      }),
      success: Schema.Struct({ ids: Schema.Array(Schema.String), count: Schema.Number }),
      error: StandardErrors,
    }),
  )
  .prefix("/api") {}
