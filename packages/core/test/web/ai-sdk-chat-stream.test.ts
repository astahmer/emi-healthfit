import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { aiSdkChatStreamDecoder } from "../../src/adapters/ai-sdk.export.ts";

const createResponse = (chunks: ReadonlyArray<UIMessageChunk>): Response =>
  createUIMessageStreamResponse({
    stream: new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  });

const decode = ({
  response,
  isCurrent = () => true,
}: {
  readonly response: Response;
  readonly isCurrent?: () => boolean;
}) => {
  const messages: unknown[] = [];
  const effect = aiSdkChatStreamDecoder({
    response,
    now: () => "2026-01-01T00:00:00.000Z",
    createId: () => "generated-assistant",
    inactivityTimeoutMilliseconds: 100,
    sendMessage: (message) => messages.push(message),
    isCurrent,
  });
  return { effect, messages };
};

describe("AI SDK chat stream decoder", () => {
  it("decodes UI message chunks into protocol messages", async () => {
    const { effect, messages } = decode({
      response: createResponse([
        { type: "start", messageId: "assistant-1" },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: "Hello" },
        { type: "text-end", id: "text-1" },
        { type: "finish" },
      ]),
    });

    const latest = await Effect.runPromise(effect);

    expect(latest).toEqual({
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "Hello" }],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(messages.at(-1)).toEqual(latest);
  });

  it("fails when the response does not contain a stream body", async () => {
    const { effect } = decode({ response: new Response(null) });

    await expect(Effect.runPromise(effect)).rejects.toThrow(
      "Chat response did not contain a stream.",
    );
  });

  it("stops consuming a superseded stream", async () => {
    const { effect, messages } = decode({
      response: createResponse([
        { type: "start", messageId: "assistant-1" },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: "Ignored" },
        { type: "finish" },
      ]),
      isCurrent: () => false,
    });

    await Effect.runPromise(effect);

    expect(messages).toEqual([]);
  });
});
