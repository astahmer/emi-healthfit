import assert from "node:assert";
import { describe, it } from "node:test";
import { buildAssistantParts } from "../src/chat/assistant-parts.ts";

describe("buildAssistantParts", () => {
  it("preserves tool results from separate tool messages", () => {
    const parts = buildAssistantParts([
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "call-1", toolName: "get_recovery", args: {} },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "get_recovery",
            result: { label: "Good", explanation: "You slept well" },
          },
        ],
      },
    ]);

    assert.strictEqual(parts.length, 1);
    const toolPart = parts[0] as {
      type: string;
      toolName: string;
      result: { label: string; explanation: string };
      status: { type: string };
    };
    assert.strictEqual(toolPart.type, "tool-call");
    assert.strictEqual(toolPart.toolName, "get_recovery");
    assert.strictEqual(toolPart.result.label, "Good");
    assert.strictEqual(toolPart.status.type, "complete");
  });

  it("keeps text and tool-call order from the assistant message", () => {
    const parts = buildAssistantParts([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Here is the info:" },
          { type: "tool-call", toolCallId: "call-2", toolName: "get_summary", args: { date: "today" } },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "call-2", toolName: "get_summary", result: { total: 100 } },
        ],
      },
    ]);

    assert.strictEqual(parts.length, 2);
    assert.deepStrictEqual(parts[0], { type: "text", text: "Here is the info:" });
    const toolPart = parts[1] as { type: string; toolName: string; result: { total: number } };
    assert.strictEqual(toolPart.type, "tool-call");
    assert.strictEqual(toolPart.toolName, "get_summary");
    assert.strictEqual(toolPart.result.total, 100);
  });

  it("returns an empty array when there are no assistant messages", () => {
    const parts = buildAssistantParts([]);
    assert.strictEqual(parts.length, 0);
  });
});
