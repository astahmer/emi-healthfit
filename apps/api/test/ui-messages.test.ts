import assert from "node:assert";
import { describe, it } from "node:test";
import type { UIMessage } from "ai";
import { Chat } from "@emi/core/chat";
import * as Effect from "effect/Effect";
import {
  AiSdkMessageValidationError,
  validateStoredUIMessagesEffect,
} from "../src/core/chat/ai-sdk.ts";

describe("stored UI messages", () => {
  it("accepts an empty history before the first user message", async () => {
    assert.deepStrictEqual(await Chat.messages.validateStoredUIMessages([]), []);
  });

  it("validates non-empty persisted history", async () => {
    const messages: UIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "First message" }],
      },
    ];

    assert.deepStrictEqual(await Chat.messages.validateStoredUIMessages(messages), messages);
  });

  it("rejects obsolete dynamic tool error payloads", async () => {
    await assert.rejects(
      Chat.messages.validateStoredUIMessages([
        {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "tool-invocation",
              toolName: "render_component",
              toolCallId: "call-1",
              input: {},
              output: { type: "error-text", value: "Invalid MetricCard props" },
              outcome: "error",
              state: "output-error",
            },
          ],
        },
      ]),
    );
  });

  it("keeps stored validation failures in the tagged Effect channel", async () => {
    await assert.rejects(
      Effect.runPromise(
        validateStoredUIMessagesEffect([
          {
            id: "assistant-1",
            role: "assistant",
            parts: [{ type: "unsupported", value: true }],
          },
        ]),
      ),
      (error: unknown) => error instanceof AiSdkMessageValidationError,
    );
  });
});
