import * as Schema from "effect/Schema";
import type * as Stream from "effect/Stream";
import { GenerationIdSchema } from "./ids.ts";
import { ChatMessageSchema } from "./messages.ts";
import { MessagePartSchema } from "./parts.ts";
import { TransportErrorSchema, type TransportError } from "./errors.ts";

export const ModelConfigurationSchema = Schema.Struct({
  model: Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/)),
  provider: Schema.optional(Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/))),
  temperature: Schema.optional(Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 2 }))),
});
export type ModelConfiguration = typeof ModelConfigurationSchema.Type;

export const ModelGenerationInputSchema = Schema.Struct({
  messages: Schema.Array(ChatMessageSchema),
  configuration: ModelConfigurationSchema,
});
export type ModelGenerationInput = typeof ModelGenerationInputSchema.Type;

export const GenerationEventSchema = Schema.Union([
  Schema.Struct({ type: Schema.Literal("started"), generationId: GenerationIdSchema }),
  Schema.Struct({ type: Schema.Literal("message-part"), part: MessagePartSchema }),
  Schema.Struct({ type: Schema.Literal("completed"), message: ChatMessageSchema }),
  Schema.Struct({ type: Schema.Literal("failed"), error: TransportErrorSchema }),
]);
export type GenerationEvent = typeof GenerationEventSchema.Type;

export type ModelProviderError = TransportError;

export interface ModelProvider {
  readonly generate: (
    input: ModelGenerationInput,
  ) => Stream.Stream<GenerationEvent, ModelProviderError>;
}
