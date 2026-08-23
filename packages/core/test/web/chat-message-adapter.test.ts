import { describe, expect, it } from "vitest";
import type { ChatUiMessage } from "../../src/chat/ui-messages.ts";
import {
  chatMessageText,
  hasVisibleChatContent,
  toThreadMessageValue,
} from "../../src/web/thread/chat-message-adapter.ts";

const message = (overrides?: Partial<ChatUiMessage>): ChatUiMessage =>
  ({
    id: "message-1",
    role: "user",
    parts: [{ type: "text", text: "hello" }],
    ...overrides,
  }) as ChatUiMessage;

describe("chatMessageText", () => {
  it("joins text parts with newlines", () => {
    expect(
      chatMessageText(
        message({
          parts: [
            { type: "text", text: "first" },
            { type: "text", text: "second" },
          ],
        }) as ChatUiMessage,
      ),
    ).toBe("first\nsecond");
  });

  it("ignores non-text parts and returns empty string for missing messages", () => {
    expect(chatMessageText(message({ parts: [{ type: "file", url: "x" }] } as ChatUiMessage))).toBe(
      "",
    );
    expect(chatMessageText(undefined)).toBe("");
  });
});

describe("toThreadMessageValue", () => {
  it("projects id, role, and parts", () => {
    const source = message();
    expect(toThreadMessageValue(source)).toEqual({
      id: source.id,
      role: source.role,
      parts: source.parts,
    });
  });
});

describe("hasVisibleChatContent", () => {
  it("treats blank text-only assistant messages as invisible", () => {
    expect(hasVisibleChatContent(message({ role: "assistant", parts: [] }))).toBe(false);
    expect(
      hasVisibleChatContent(message({ role: "assistant", parts: [{ type: "text", text: "   " }] })),
    ).toBe(false);
  });

  it("keeps non-text parts visible regardless of text content", () => {
    expect(
      hasVisibleChatContent(message({ parts: [{ type: "file", url: "x" }] } as ChatUiMessage)),
    ).toBe(true);
  });

  it("keeps whitespace-prefixed text visible", () => {
    expect(hasVisibleChatContent(message({ parts: [{ type: "text", text: " words " }] }))).toBe(
      true,
    );
  });
});
