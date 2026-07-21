import { describe, expect, it } from "vitest";
import { resolveQueueEditTarget, shouldHandleQueueArrowKey } from "./follow-up-queue";

const item = (id: string, text: string) => ({ id, text, files: [] });

describe("resolveQueueEditTarget", () => {
  it("starts editing from the newest queued item on ArrowUp", () => {
    expect(
      resolveQueueEditTarget({
        queuedFollowUps: [item("a", "one"), item("b", "two")],
        editingQueuedId: null,
        direction: "up",
      }),
    ).toEqual(item("b", "two"));
  });

  it("moves toward older queued items on repeated ArrowUp", () => {
    expect(
      resolveQueueEditTarget({
        queuedFollowUps: [item("a", "one"), item("b", "two")],
        editingQueuedId: "b",
        direction: "up",
      }),
    ).toEqual(item("a", "one"));
  });

  it("clears editing when ArrowDown moves past the newest item", () => {
    expect(
      resolveQueueEditTarget({
        queuedFollowUps: [item("a", "one"), item("b", "two")],
        editingQueuedId: "b",
        direction: "down",
      }),
    ).toBeNull();
  });
});

describe("shouldHandleQueueArrowKey", () => {
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
});
