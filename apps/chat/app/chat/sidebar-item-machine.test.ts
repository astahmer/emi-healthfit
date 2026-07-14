import { createActor, fromPromise } from "xstate";
import { describe, expect, it, vi } from "vitest";
import { sidebarItemMachine } from "./sidebar-item-machine";
import type { Thread } from "../sessions";

const makeThread = (overrides?: Partial<Thread>): Thread => ({
  id: "thread-1",
  title: "Squat Session",
  status: "regular",
  created_at: "2026-07-14T11:37:55.245Z",
  updated_at: "2026-07-14T11:42:25.844Z",
  ...overrides,
});

describe("sidebarItemMachine", () => {
  it("starts idle with thread title as draft", () => {
    const thread = makeThread();
    const actor = createActor(sidebarItemMachine, { input: { thread } });
    actor.start();

    expect(actor.getSnapshot().matches("idle")).toBe(true);
    expect(actor.getSnapshot().context.thread).toEqual(thread);
    expect(actor.getSnapshot().context.draft).toBe("Squat Session");
  });

  it("synchronizes a title changed outside the sidebar item", () => {
    const thread = makeThread();
    const actor = createActor(sidebarItemMachine, { input: { thread } });
    actor.start();

    actor.send({ type: "thread.changed", thread: { ...thread, title: "Updated in header" } });

    expect(actor.getSnapshot().context.thread.title).toBe("Updated in header");
    expect(actor.getSnapshot().context.draft).toBe("Updated in header");
  });

  it("enters renaming and updates draft", () => {
    const thread = makeThread();
    const actor = createActor(sidebarItemMachine, { input: { thread } });
    actor.start();

    actor.send({ type: "rename.start" });
    actor.send({ type: "rename.change", value: "New Title" });

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches("renaming")).toBe(true);
    expect(snapshot.context.draft).toBe("New Title");
  });

  it("submits rename and updates thread title", async () => {
    const thread = makeThread();
    const onRenamed = vi.fn();
    const machine = sidebarItemMachine.provide({
      actors: {
        rename: fromPromise(async (): Promise<void> => {}),
      },
    });
    const actor = createActor(machine, { input: { thread, onRenamed } });
    actor.start();

    actor.send({ type: "rename.start" });
    actor.send({ type: "rename.change", value: "Renamed Session" });
    actor.send({ type: "rename.submit" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches("idle")).toBe(true));

    expect(actor.getSnapshot().context.thread.title).toBe("Renamed Session");
    expect(onRenamed).toHaveBeenCalled();
  });

  it("does not submit rename with empty draft", () => {
    const thread = makeThread();
    const actor = createActor(sidebarItemMachine, { input: { thread } });
    actor.start();

    actor.send({ type: "rename.start" });
    actor.send({ type: "rename.change", value: "   " });
    actor.send({ type: "rename.submit" });

    expect(actor.getSnapshot().matches("renaming")).toBe(true);
  });

  it("enters delete confirmation and deletes on confirm", async () => {
    const thread = makeThread();
    const onDeleted = vi.fn();
    const machine = sidebarItemMachine.provide({
      actors: {
        remove: fromPromise(async (): Promise<void> => {}),
      },
    });
    const actor = createActor(machine, { input: { thread, onDeleted } });
    actor.start();

    actor.send({ type: "delete.request" });
    expect(actor.getSnapshot().matches("confirmingDelete")).toBe(true);

    actor.send({ type: "delete.confirm" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches("deleted")).toBe(true));
    expect(onDeleted).toHaveBeenCalled();
  });

  it("cancels delete confirmation", () => {
    const thread = makeThread();
    const actor = createActor(sidebarItemMachine, { input: { thread } });
    actor.start();

    actor.send({ type: "delete.request" });
    actor.send({ type: "delete.cancel" });

    expect(actor.getSnapshot().matches("idle")).toBe(true);
  });

  it("sets copiedId after successful copy and clears after delay", async () => {
    vi.useFakeTimers();
    const thread = makeThread();
    const machine = sidebarItemMachine.provide({
      actors: {
        copyMarkdown: fromPromise(async (): Promise<void> => {}),
      },
    });
    const actor = createActor(machine, { input: { thread } });
    actor.start();

    actor.send({ type: "copy.markdown" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches("idle")).toBe(true));
    expect(actor.getSnapshot().context.copiedId).toBe("thread-1");

    vi.advanceTimersByTime(2500);
    expect(actor.getSnapshot().context.copiedId).toBeNull();

    vi.useRealTimers();
  });
});
