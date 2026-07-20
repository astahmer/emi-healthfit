import { describe, expect, it } from "vitest";
import type { ConversationMessageNode } from "../src/conversation/types.ts";
import { conversationMarkdown } from "../src/conversation/conversation-markdown.ts";

const message = (overrides: Partial<ConversationMessageNode>): ConversationMessageNode => ({
  id: "message-1",
  parentId: null,
  role: "user",
  parts: [{ type: "text", text: "Question" }],
  createdAt: "2026-07-18T12:00:00.000Z",
  ...overrides,
});

describe("conversationMarkdown", () => {
  it("formats every persisted message with its role and text", () => {
    expect(
      conversationMarkdown([
        message({ role: "user", parts: [{ type: "text", text: "Question" }] }),
        message({ id: "message-2", role: "assistant", parts: [{ type: "text", text: "Answer" }] }),
      ]),
    ).toBe("## User\n\nQuestion\n\n---\n\n## Assistant\n\nAnswer");
  });
});
