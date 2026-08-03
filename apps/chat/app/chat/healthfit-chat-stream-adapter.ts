import {
  parseJsonEventStream,
  readUIMessageStream,
  uiMessageChunkSchema,
  type UIMessageChunk,
} from "ai";
import * as Effect from "effect/Effect";
import { Chat } from "@emi/core/chat";
import type { ChatStreamDecoder } from "@emi/core/web";

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
  sendMessage,
  isCurrent,
}) =>
  Effect.tryPromise({
    try: async () => {
      let latest;
      const stream = readUIMessageStream({
        stream: toUiMessageStream(response),
        terminateOnError: true,
      });
      for await (const uiMessage of stream) {
        if (!isCurrent()) break;
        const parts = await Chat.messages.toProtocolParts({
          parts: uiMessage.parts,
          createId,
        });
        latest = {
          id: uiMessage.id.trim() === "" ? createId() : uiMessage.id,
          role: uiMessage.role,
          parts: [...parts],
          createdAt: now(),
        };
        sendMessage(latest);
      }
      return latest;
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
