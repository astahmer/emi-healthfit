import assert from "node:assert";
import { describe, it } from "node:test";
import { Chat } from "@emi/core/chat";

describe("buildAssistantParts", () => {
  it("preserves tool results from separate tool messages", async () => {
    const parts = await Chat.messages.buildAssistantParts([
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "call-1", toolName: "get_recovery", input: {} }],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "get_recovery",
            output: { label: "Good", explanation: "You slept well" },
          },
        ],
      },
    ]);

    assert.strictEqual(parts.length, 1);
    const toolPart = parts[0];
    assert.equal(toolPart?.type, "tool-invocation");
    if (toolPart?.type !== "tool-invocation") return;
    assert.strictEqual(toolPart.toolName, "get_recovery");
    assert.strictEqual(toolPart.toolCallId, "call-1");
    assert.deepStrictEqual(toolPart.input, {});
    assert.equal(toolPart.state, "output-available");
    if (toolPart.state !== "output-available") return;
    assert.deepStrictEqual(toolPart.output, { label: "Good", explanation: "You slept well" });
    assert.strictEqual(toolPart.state, "output-available");
  });

  it("keeps text and tool-call order from the assistant message", async () => {
    const parts = await Chat.messages.buildAssistantParts([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Here is the info:" },
          {
            type: "tool-call",
            toolCallId: "call-2",
            toolName: "get_summary",
            input: { date: "today" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-2",
            toolName: "get_summary",
            output: { total: 100 },
          },
        ],
      },
    ]);

    assert.strictEqual(parts.length, 2);
    assert.deepStrictEqual(parts[0], { type: "text", text: "Here is the info:" });
    const toolPart = parts[1];
    assert.equal(toolPart?.type, "tool-invocation");
    if (toolPart?.type !== "tool-invocation") return;
    assert.strictEqual(toolPart.toolName, "get_summary");
    assert.equal(toolPart.state, "output-available");
    if (toolPart.state !== "output-available") return;
    assert.deepStrictEqual(toolPart.output, { total: 100 });
  });

  it("returns an empty array when there are no assistant messages", async () => {
    const parts = await Chat.messages.buildAssistantParts([]);
    assert.strictEqual(parts.length, 0);
  });

  it("unwraps provider outputs and deduplicates repeated step messages", async () => {
    const assistantMessage = {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "call-3", toolName: "get_recovery", input: {} }],
    };
    const parts = await Chat.messages.buildAssistantParts([
      assistantMessage,
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-3",
            output: { type: "json", value: { score: 90 } },
          },
        ],
      },
      assistantMessage,
    ]);

    assert.strictEqual(parts.length, 1);
    const toolPart = parts[0];
    assert.equal(toolPart?.type, "tool-invocation");
    if (toolPart?.type !== "tool-invocation") return;
    assert.equal(toolPart.state, "output-available");
    if (toolPart.state !== "output-available") return;
    assert.deepStrictEqual(toolPart.output, { score: 90 });
  });

  it("persists error-text tool outcomes as failed", async () => {
    const parts = await Chat.messages.buildAssistantParts([
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "failed-1", toolName: "get_workout_history", input: {} },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "failed-1",
            output: { type: "error-text", value: "Only one SELECT query is allowed." },
          },
        ],
      },
    ]);

    assert.deepStrictEqual(parts[0], {
      type: "tool-invocation",
      toolName: "get_workout_history",
      toolCallId: "failed-1",
      input: {},
      errorText: "Only one SELECT query is allowed.",
      state: "output-error",
    });
  });
});
