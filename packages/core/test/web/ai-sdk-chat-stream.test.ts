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

  it("decodes AI SDK v6 step markers around text and tool parts", async () => {
    const { effect, messages } = decode({
      response: createResponse([
        { type: "start", messageId: "assistant-1" },
        { type: "start-step" },
        {
          type: "tool-input-start",
          toolCallId: "call-1",
          toolName: "get_workout_streak",
          dynamic: true,
        },
        {
          type: "tool-input-available",
          toolCallId: "call-1",
          toolName: "get_workout_streak",
          input: {},
          dynamic: true,
        },
        {
          type: "tool-output-available",
          toolCallId: "call-1",
          output: { current_streak: 5 },
          dynamic: true,
        },
        { type: "finish-step" },
        { type: "start-step" },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: "You are on a 5-day streak." },
        { type: "text-end", id: "text-1" },
        { type: "finish-step" },
        { type: "finish" },
      ]),
    });

    const latest = await Effect.runPromise(effect);

    expect(latest).toMatchObject({
      id: "assistant-1",
      role: "assistant",
    });
    expect(latest?.parts).toEqual([
      {
        type: "tool-invocation",
        toolName: "get_workout_streak",
        toolCallId: "call-1",
        state: "output-available",
        input: {},
        output: { current_streak: 5 },
      },
      { type: "text", text: "You are on a 5-day streak." },
    ]);
    expect(messages.at(-1)).toEqual(latest);
  });
});
