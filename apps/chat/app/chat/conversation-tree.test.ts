import { describe, expect, it } from "vitest";
import type { MessageNode, ThreadView } from "./conversation-machine";
import {
  getChildMessages,
  getMessageAncestors,
  getMessagePath,
  getRootMessages,
  getThreadMessages,
  searchMessages,
} from "./conversation-tree";

const makeMessage = (overrides?: Partial<MessageNode>): MessageNode => ({
  id: "msg-1",
  conversationId: "conv-1",
  parentId: null,
  role: "user",
  parts: [{ type: "text", text: "hello" }],
  createdAt: "2026-07-14T10:00:00.000Z",
  ...overrides,
});

const makeThread = (overrides?: Partial<ThreadView>): ThreadView => ({
  id: "thread-1",
  conversationId: "conv-1",
  anchorMessageId: "msg-1",
  title: null,
  status: "regular",
  pinned: false,
  messageIds: ["msg-1"],
  createdAt: "2026-07-14T10:00:00.000Z",
  updatedAt: "2026-07-14T10:00:00.000Z",
  ...overrides,
});

describe("conversation-tree", () => {
  it("returns root messages", () => {
    const root = makeMessage({ id: "root" });
    const child = makeMessage({ id: "child", parentId: "root" });
    expect(getRootMessages([root, child])).toEqual([root]);
  });

  it("returns children sorted by createdAt", () => {
    const parent = makeMessage({ id: "parent" });
    const first = makeMessage({
      id: "first",
      parentId: "parent",
      createdAt: "2026-07-14T09:00:00.000Z",
    });
    const second = makeMessage({
      id: "second",
      parentId: "parent",
      createdAt: "2026-07-14T10:00:00.000Z",
    });
    expect(getChildMessages([parent, second, first], "parent")).toEqual([first, second]);
  });

  it("builds message ancestors", () => {
    const grandparent = makeMessage({ id: "gp" });
    const parent = makeMessage({ id: "p", parentId: "gp" });
    const child = makeMessage({ id: "c", parentId: "p" });
    expect(getMessageAncestors([grandparent, parent, child], "c")).toEqual([grandparent, parent]);
  });

  it("stops ancestors at missing parent", () => {
    const orphan = makeMessage({ id: "o", parentId: "missing" });
    expect(getMessageAncestors([orphan], "o")).toEqual([]);
  });

  it("builds full message path", () => {
    const root = makeMessage({ id: "root" });
    const child = makeMessage({ id: "child", parentId: "root" });
    expect(getMessagePath([root, child], "child")).toEqual([root, child]);
  });

  it("returns empty path for unknown message", () => {
    expect(getMessagePath([], "x")).toEqual([]);
  });

  it("returns messages included in a thread", () => {
    const a = makeMessage({ id: "a" });
    const b = makeMessage({ id: "b" });
    const thread = makeThread({ messageIds: ["b", "a"] });
    expect(getThreadMessages([a, b], thread)).toEqual([a, b]);
  });

  it("searches message text", () => {
    const match = makeMessage({ id: "match", parts: [{ type: "text", text: "Hello world" }] });
    const miss = makeMessage({ id: "miss", parts: [{ type: "text", text: "Goodbye" }] });
    expect(searchMessages([match, miss], "hello")).toEqual([match]);
  });

  it("returns empty search results for blank query", () => {
    const message = makeMessage();
    expect(searchMessages([message], "   ")).toEqual([]);
  });
});
