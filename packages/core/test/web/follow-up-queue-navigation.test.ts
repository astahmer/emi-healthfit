import { describe, expect, it } from "vitest";
import {
  resolveQueueEditTarget,
  shouldHandleQueueArrowKey,
} from "../../src/web/chat-runtime/follow-up-queue-navigation.ts";

const item = (id: string) => ({ id });

describe("resolveQueueEditTarget", () => {
  const queue = [item("a"), item("b"), item("c")];

  it("returns null for an empty queue", () => {
    expect(
      resolveQueueEditTarget({ queuedFollowUps: [], editingQueuedId: null, direction: "up" }),
    ).toBeNull();
  });

  it("starts editing from the newest queued item on ArrowUp", () => {
    expect(
      resolveQueueEditTarget({ queuedFollowUps: queue, editingQueuedId: null, direction: "up" }),
    ).toEqual(item("c"));
  });

  it("moves toward older queued items on repeated ArrowUp", () => {
    expect(
      resolveQueueEditTarget({ queuedFollowUps: queue, editingQueuedId: "c", direction: "up" }),
    ).toEqual(item("b"));
    expect(
      resolveQueueEditTarget({ queuedFollowUps: queue, editingQueuedId: "b", direction: "up" }),
    ).toEqual(item("a"));
  });

  it("stays on the oldest item when ArrowUp repeats at the start", () => {
    expect(
      resolveQueueEditTarget({ queuedFollowUps: queue, editingQueuedId: "a", direction: "up" }),
    ).toEqual(item("a"));
  });

  it("clears editing when ArrowDown moves past the oldest item", () => {
    expect(
      resolveQueueEditTarget({ queuedFollowUps: queue, editingQueuedId: "c", direction: "down" }),
    ).toBeNull();
  });

  it("moves toward newer queued items on ArrowDown", () => {
    expect(
      resolveQueueEditTarget({ queuedFollowUps: queue, editingQueuedId: "b", direction: "down" }),
    ).toEqual(item("c"));
  });

  it("ignores ArrowDown when nothing is being edited", () => {
    expect(
      resolveQueueEditTarget({ queuedFollowUps: queue, editingQueuedId: null, direction: "down" }),
    ).toBeNull();
  });
});

describe("shouldHandleQueueArrowKey", () => {
  it("returns false when the queue is empty", () => {
    expect(
      shouldHandleQueueArrowKey({
        key: "ArrowUp",
        draft: "",
        selectionStart: 0,
        queueLength: 0,
        editingQueuedId: null,
      }),
    ).toBe(false);
  });

  it("only intercepts ArrowUp from an empty composer at the start", () => {
    expect(
      shouldHandleQueueArrowKey({
        key: "ArrowUp",
        draft: "",
        selectionStart: 0,
        queueLength: 1,
        editingQueuedId: null,
      }),
    ).toBe(true);
    expect(
      shouldHandleQueueArrowKey({
        key: "ArrowUp",
        draft: "",
        selectionStart: 1,
        queueLength: 1,
        editingQueuedId: null,
      }),
    ).toBe(false);
    expect(
      shouldHandleQueueArrowKey({
        key: "ArrowUp",
        draft: "typing",
        selectionStart: 0,
        queueLength: 1,
        editingQueuedId: null,
      }),
    ).toBe(false);
  });

  it("intercepts arrows while a queued item is being edited", () => {
    expect(
      shouldHandleQueueArrowKey({
        key: "ArrowDown",
        draft: "two",
        selectionStart: 3,
        queueLength: 2,
        editingQueuedId: "b",
      }),
    ).toBe(true);
  });

  it("ignores unrelated keys", () => {
    expect(
      shouldHandleQueueArrowKey({
        key: "ArrowLeft",
        draft: "",
        selectionStart: 0,
        queueLength: 1,
        editingQueuedId: null,
      }),
    ).toBe(false);
  });
});
