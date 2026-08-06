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

  it("stacks repeated compactions on the latest summary in conversation order", () => {
    const messages = [
      { id: "old", role: "user", createdAt: "2026-07-14T10:00:00.000Z" },
      { id: "summary-1", role: "summary", createdAt: "2026-07-20T00:00:00.000Z" },
      { id: "mid", role: "user", createdAt: "2026-07-20T00:01:00.000Z" },
      { id: "summary-2", role: "summary", createdAt: "2026-07-20T00:02:00.000Z" },
      { id: "new", role: "user", createdAt: "2026-07-20T00:03:00.000Z" },
    ];

    expect(collapseCompactedMessages(messages).map((message) => message.id)).toEqual([
      "summary-2",
      "new",
    ]);
  });

  it("keeps rows inserted in the same millisecond as the marker when they follow it", () => {
    const messages = [
      { id: "old", role: "user", parentId: null, createdAt: "2026-07-14T10:00:00.000Z" },
      { id: "summary-1", role: "summary", parentId: "old", createdAt: "2026-07-20T00:00:00.000Z" },
      { id: "new-root", role: "user", parentId: null, createdAt: "2026-07-20T00:00:00.000Z" },
    ];

    expect(collapseCompactedMessages(messages).map((message) => message.id)).toEqual([
      "summary-1",
      "new-root",
    ]);
  });

  it("keeps messages untouched when there is no summary", () => {
    const messages = [
      { id: "a", role: "user", createdAt: "2026-07-14T10:00:00.000Z" },
      { id: "b", role: "assistant", createdAt: "2026-07-14T10:01:00.000Z" },
    ];

    expect(collapseCompactedMessages(messages).map((message) => message.id)).toEqual(["a", "b"]);
  });

  it("keeps pre-marker branch rows and drops the pre-marker root anchor", () => {
    const messages = [
      { id: "anchor", role: "user", parentId: null, createdAt: "2026-07-14T10:00:00.000Z" },
      { id: "branch-1", role: "user", parentId: "anchor", createdAt: "2026-07-14T10:05:00.000Z" },
      {
        id: "branch-2",
        role: "assistant",
        parentId: "branch-1",
        createdAt: "2026-07-14T10:06:00.000Z",
      },
      {
        id: "summary-1",
        role: "summary",
        parentId: "branch-2",
        createdAt: "2026-07-20T00:00:00.000Z",
      },
    ];

    expect(collapseCompactedMessages(messages).map((message) => message.id)).toEqual([
      "summary-1",
      "branch-1",
      "branch-2",
    ]);
  });

  it("keeps post-marker root rows together with pre-marker branch rows", () => {
    const messages = [
      { id: "old-root", role: "user", parentId: null, createdAt: "2026-07-14T10:00:00.000Z" },
      {
        id: "summary-1",
        role: "summary",
        parentId: "old-root",
        createdAt: "2026-07-20T00:00:00.000Z",
      },
      { id: "new-root", role: "user", parentId: null, createdAt: "2026-07-20T00:01:00.000Z" },
      { id: "branch-1", role: "user", parentId: "old-root", createdAt: "2026-07-15T09:00:00.000Z" },
    ];

    expect(collapseCompactedMessages(messages).map((message) => message.id)).toEqual([
      "summary-1",
      "branch-1",
      "new-root",
    ]);
  });

  it("drops older summaries and treats missing parentId like a root row", () => {
    const messages = [
      { id: "old", role: "user", parentId: null, createdAt: "2026-07-14T10:00:00.000Z" },
      { id: "summary-1", role: "summary", parentId: "old", createdAt: "2026-07-20T00:00:00.000Z" },
      { id: "mid", role: "user", parentId: undefined, createdAt: "2026-07-20T00:01:00.000Z" },
      { id: "summary-2", role: "summary", parentId: "mid", createdAt: "2026-07-20T00:02:00.000Z" },
    ];

    expect(collapseCompactedMessages(messages).map((message) => message.id)).toEqual(["summary-2"]);
  });
});
