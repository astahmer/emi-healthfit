import { describe, expect, it } from "vitest";
import { collapseCompactedMessages } from "../../src/chat/message-collapse.ts";

describe("collapseCompactedMessages", () => {
  it("keeps the latest summary and post-marker rows only", () => {
    const messages = [
      { id: "old-1", role: "user", createdAt: "2026-07-14T10:00:00.000Z" },
      { id: "old-2", role: "assistant", createdAt: "2026-07-14T10:01:00.000Z" },
      { id: "summary-1", role: "summary", createdAt: "2026-07-20T00:00:00.000Z" },
      { id: "new-1", role: "user", createdAt: "2026-07-20T00:01:00.000Z" },
    ];

    expect(collapseCompactedMessages(messages).map((message) => message.id)).toEqual([
      "summary-1",
      "new-1",
    ]);
  });

  it("stacks repeated compactions on the latest summary regardless of array order", () => {
    const messages = [
      { id: "summary-2", role: "summary", createdAt: "2026-07-20T00:02:00.000Z" },
      { id: "old", role: "user", createdAt: "2026-07-14T10:00:00.000Z" },
      { id: "summary-1", role: "summary", createdAt: "2026-07-20T00:00:00.000Z" },
      { id: "mid", role: "user", createdAt: "2026-07-20T00:01:00.000Z" },
      { id: "new", role: "user", createdAt: "2026-07-20T00:03:00.000Z" },
    ];

    expect(collapseCompactedMessages(messages).map((message) => message.id)).toEqual([
      "summary-2",
      "new",
    ]);
  });

  it("keeps messages untouched when there is no summary", () => {
    const messages = [
      { id: "a", role: "user", createdAt: "2026-07-14T10:00:00.000Z" },
      { id: "b", role: "assistant", createdAt: "2026-07-14T10:01:00.000Z" },
    ];

    expect(collapseCompactedMessages(messages).map((message) => message.id)).toEqual(["a", "b"]);
  });
});
