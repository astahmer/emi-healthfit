import assert from "node:assert";
import { describe, it } from "node:test";
import type { UIMessage } from "ai";
import { Chat } from "@emi/core/chat";

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
              type: "dynamic-tool",
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
});
