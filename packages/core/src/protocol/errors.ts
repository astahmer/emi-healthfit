import * as Schema from "effect/Schema";

const errorCode = Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/^\S+$/));
const errorMessage = Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/));

export const TransportErrorSchema = Schema.Struct({
  code: errorCode,
  message: errorMessage,
  retryable: Schema.Boolean,
  details: Schema.optional(Schema.Json),
});
export type TransportError = typeof TransportErrorSchema.Type;

export const ErrorResponseDtoSchema = Schema.Struct({
  error: TransportErrorSchema,
});
export type ErrorResponseDto = typeof ErrorResponseDtoSchema.Type;

export class ProtocolDecodeError extends Schema.TaggedErrorClass<ProtocolDecodeError>()(
  "ProtocolDecodeError",
  { message: Schema.String },
) {}
