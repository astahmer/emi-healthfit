import assert from "node:assert";
import { describe, it } from "node:test";
import type { UIMessage } from "ai";
import { validateStoredUIMessages } from "../src/core/chat/ui-messages.ts";

describe("stored UI messages", () => {
  it("accepts an empty history before the first user message", async () => {
    assert.deepStrictEqual(await validateStoredUIMessages([]), []);
  });

  it("validates non-empty persisted history", async () => {
    const messages: UIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "First message" }],
      },
    ];

    assert.deepStrictEqual(await validateStoredUIMessages(messages), messages);
  });

  it("normalizes legacy dynamic tool errors", async () => {
    const messages = await validateStoredUIMessages([
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
    ]);

    assert.deepStrictEqual(messages[0]?.parts, [
      {
        type: "dynamic-tool",
        toolName: "render_component",
        toolCallId: "call-1",
        input: {},
        errorText: "Invalid MetricCard props",
        state: "output-error",
      },
    ]);
  });
});
