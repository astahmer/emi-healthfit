import assert from "node:assert";
import { describe, it } from "node:test";
import { buildAssistantParts } from "../src/chat/assistant-parts.ts";

describe("buildAssistantParts", () => {
  it("preserves tool results from separate tool messages", () => {
    const parts = buildAssistantParts([
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
    const toolPart = parts[0] as {
      type: string;
      toolName: string;
      toolCallId: string;
      input: unknown;
      output: { label: string; explanation: string };
      state: string;
    };
    assert.strictEqual(toolPart.type, "dynamic-tool");
    assert.strictEqual(toolPart.toolName, "get_recovery");
    assert.strictEqual(toolPart.toolCallId, "call-1");
    assert.deepStrictEqual(toolPart.input, {});
    assert.strictEqual(toolPart.output.label, "Good");
    assert.strictEqual(toolPart.state, "output-available");
  });

  it("keeps text and tool-call order from the assistant message", () => {
    const parts = buildAssistantParts([
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
    const toolPart = parts[1] as { type: string; toolName: string; output: { total: number } };
    assert.strictEqual(toolPart.type, "dynamic-tool");
    assert.strictEqual(toolPart.toolName, "get_summary");
    assert.strictEqual(toolPart.output.total, 100);
  });

  it("returns an empty array when there are no assistant messages", () => {
    const parts = buildAssistantParts([]);
    assert.strictEqual(parts.length, 0);
  });

  it("unwraps provider outputs and deduplicates repeated step messages", () => {
    const assistantMessage = {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "call-3", toolName: "get_recovery", input: {} }],
    };
    const parts = buildAssistantParts([
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
    assert.deepStrictEqual((parts[0] as { output: unknown }).output, { score: 90 });
  });
});
