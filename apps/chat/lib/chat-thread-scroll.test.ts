import { beforeEach, describe, expect, it } from "vitest";
import {
  SCROLL_RESTORATION_STORAGE_KEY,
  chatThreadScrollKey,
  chatThreadScrollSelector,
  previewMessageText,
  readChatThreadScrollY,
  writeChatThreadScrollY,
} from "./chat-thread-scroll";

describe("chat-thread-scroll", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("builds pathname keys for new and existing sessions", () => {
    expect(chatThreadScrollKey({ sessionId: undefined })).toBe("/chat");
    expect(chatThreadScrollKey({ sessionId: "one" })).toBe("/chat/one");
  });

  it("reads and writes restored chat thread scroll positions", () => {
    writeChatThreadScrollY({ sessionId: "one", scrollY: 420 });

    expect(readChatThreadScrollY({ sessionId: "one" })).toBe(420);
    expect(readChatThreadScrollY({ sessionId: "two" })).toBeUndefined();

    const cache = JSON.parse(sessionStorage.getItem(SCROLL_RESTORATION_STORAGE_KEY) ?? "{}") as {
      "/chat/one": Record<string, { scrollY: number }>;
    };
    expect(cache["/chat/one"][chatThreadScrollSelector]?.scrollY).toBe(420);
  });

  it("truncates preview text", () => {
    expect(previewMessageText({ text: "  hello   world  ", maxLength: 20 })).toBe("hello world");
    expect(previewMessageText({ text: "abcdefghij", maxLength: 8 })).toBe("abcdefg…");
  });
});
