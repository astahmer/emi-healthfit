import * as Schema from "effect/Schema";
import type * as Stream from "effect/Stream";
import { GenerationIdSchema } from "./ids.ts";
import { ChatMessageSchema } from "./messages.ts";
import { MessagePartSchema } from "./parts.ts";
import { TransportErrorSchema, type TransportError } from "./errors.ts";

const nonEmptyIdentifier = Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/));
const nonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const nonNegativeNumber = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0));

export const ModelCapabilitiesSchema = Schema.Struct({
  streaming: Schema.Boolean,
  toolCalling: Schema.Boolean,
  imageInput: Schema.Boolean,
  fileInput: Schema.Boolean,
  structuredOutput: Schema.Boolean,
  webSearch: Schema.Boolean,
  voiceInput: Schema.Boolean,
  voiceOutput: Schema.Boolean,
});
export type ModelCapabilities = typeof ModelCapabilitiesSchema.Type;

export const ModelDescriptorSchema = Schema.Struct({
  id: nonEmptyIdentifier,
  label: nonEmptyIdentifier,
  description: Schema.String,
  provider: nonEmptyIdentifier,
  capabilities: ModelCapabilitiesSchema,
  limits: Schema.optional(
    Schema.Struct({
      contextTokens: Schema.optional(nonNegativeInteger),
      maxOutputTokens: Schema.optional(nonNegativeInteger),
    }),
  ),
  pricing: Schema.optional(
    Schema.Struct({
      inputUsdPerMillion: nonNegativeNumber,
      outputUsdPerMillion: nonNegativeNumber,
    }),
  ),
});
export type ModelDescriptor = typeof ModelDescriptorSchema.Type;

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
