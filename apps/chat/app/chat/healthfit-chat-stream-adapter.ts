import {
  parseJsonEventStream,
  readUIMessageStream,
  uiMessageChunkSchema,
  type UIMessageChunk,
} from "ai";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Chat } from "@emi/core/chat";
import type { ChatMessage } from "@emi/core/protocol";
import type { ChatStreamDecoder } from "@emi/core/web";

class HealthFitChatStreamError extends Schema.TaggedErrorClass<HealthFitChatStreamError>()(
  "HealthFitChatStreamError",
  { message: Schema.String },
) {}

const toUiMessageStream = (response: Response): ReadableStream<UIMessageChunk> => {
  if (response.body === null) throw new Error("Chat response did not contain a stream.");
  return parseJsonEventStream({
    stream: response.body,
    schema: uiMessageChunkSchema,
  }).pipeThrough(
    new TransformStream({
      transform(result, controller) {
        if (!result.success) {
          controller.error(result.error);
          return;
        }
        controller.enqueue(result.value);
      },
    }),
  );
};

export const healthFitChatStreamDecoder: ChatStreamDecoder = ({
  response,
  now,
  createId,
  inactivityTimeoutMilliseconds,
  sendMessage,
  isCurrent,
}) =>
  Effect.gen(function* () {
    let latest: ChatMessage | undefined;
    const stream = readUIMessageStream({
      stream: toUiMessageStream(response),
      terminateOnError: true,
    });
    yield* Stream.fromReadableStream({
      evaluate: () => stream,
      onError: (cause) =>
        new HealthFitChatStreamError({
          message: cause instanceof Error ? cause.message : String(cause),
        }),
      releaseLockOnEnd: true,
    }).pipe(
      Stream.timeoutOrElse({
        duration: inactivityTimeoutMilliseconds,
        orElse: () =>
          Stream.fail(
            new HealthFitChatStreamError({ message: "Chat response stalled before completion." }),
          ),
      }),
      Stream.takeWhile(() => isCurrent()),
      Stream.runForEach((uiMessage) =>
        Effect.tryPromise({
          try: async () => {
            const parts = await Chat.messages.toProtocolParts({
              parts: uiMessage.parts,
              createId,
            });
            return {
              id: uiMessage.id.trim() === "" ? createId() : uiMessage.id,
              role: uiMessage.role,
              parts: [...parts],
              createdAt: now(),
            } satisfies ChatMessage;
          },
          catch: (cause) =>
            new HealthFitChatStreamError({
              message: cause instanceof Error ? cause.message : String(cause),
            }),
        }).pipe(
          Effect.tap((message) =>
            Effect.sync(() => {
              latest = message;
              sendMessage(message);
            }),
          ),
        ),
      ),
    );
    return latest;
  });
