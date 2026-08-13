import { uiMessageChunkSchema, type UIMessageChunk } from "ai";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { readableErrorMessage } from "../chat/error-message.ts";

export class UiMessageChunkDecodeError extends Schema.TaggedErrorClass<UiMessageChunkDecodeError>()(
  "UiMessageChunkDecodeError",
  { message: Schema.String },
) {}

export class UiMessageChunkDecoder {
  static readonly decode: (
    value: unknown,
  ) => Effect.Effect<UIMessageChunk, UiMessageChunkDecodeError> = Effect.fn(
    "core.uiMessageChunk.decode",
  )(function* (value: unknown) {
    const validate = uiMessageChunkSchema().validate;
    if (validate === undefined) {
      return yield* Effect.fail(
        new UiMessageChunkDecodeError({ message: "UI message chunk validator is unavailable" }),
      );
    }
    const result = yield* Effect.tryPromise({
      try: () => Promise.resolve(validate(value)),
      catch: (cause) =>
        new UiMessageChunkDecodeError({
          message: readableErrorMessage(cause, "UI message chunk could not be validated."),
        }),
    });
    if (!result.success) {
      return yield* Effect.fail(
        new UiMessageChunkDecodeError({
          message: readableErrorMessage(result.error, "UI message chunk could not be validated."),
        }),
      );
    }
    return result.value;
  });
}
