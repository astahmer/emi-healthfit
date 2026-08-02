import { beforeEach, describe, expect, it } from "vitest";
import { ChatThreadScroll } from "../../src/web/thread/chat-thread-scroll.ts";

describe("ChatThreadScroll", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("builds pathname keys for new and existing sessions", () => {
    expect(ChatThreadScroll.key({ sessionId: undefined })).toBe("/chat");
    expect(ChatThreadScroll.key({ sessionId: "one" })).toBe("/chat/one");
  });

  it("reads and writes restored chat thread scroll positions", () => {
    ChatThreadScroll.writeScrollY({ sessionId: "one", scrollY: 420 });

    expect(ChatThreadScroll.readScrollY({ sessionId: "one" })).toBe(420);
    expect(ChatThreadScroll.readScrollY({ sessionId: "two" })).toBeUndefined();
    const cache = JSON.parse(
      sessionStorage.getItem(ChatThreadScroll.restorationStorageKey) ?? "{}",
    ) as { "/chat/one": Record<string, { scrollY: number }> };
    expect(cache["/chat/one"][ChatThreadScroll.selector]?.scrollY).toBe(420);
  });

  it("truncates preview text", () => {
    expect(ChatThreadScroll.preview({ text: "  hello   world  ", maxLength: 20 })).toBe(
      "hello world",
    );
    expect(ChatThreadScroll.preview({ text: "abcdefghij", maxLength: 8 })).toBe("abcdefg…");
  });
});
