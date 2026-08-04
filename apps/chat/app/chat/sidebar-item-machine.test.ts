import { createActor, fromPromise } from "xstate";
import { describe, expect, it, vi } from "vitest";
import { sidebarItemMachine } from "./sidebar-item-machine";
import type { Thread } from "../sessions";

const makeThread = (overrides?: Partial<Thread>): Thread => ({
  id: "thread-1",
  title: "Squat Session",
  status: "regular",
  pinned: false,
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
    const onDeleteStarted = vi.fn();
    const machine = sidebarItemMachine.provide({
      actors: {
        remove: fromPromise(async (): Promise<void> => undefined),
      },
    });
    const actor = createActor(machine, { input: { thread, onDeleteStarted } });
    actor.start();

    actor.send({ type: "delete.request" });
    expect(actor.getSnapshot().matches("confirmingDelete")).toBe(true);

    actor.send({ type: "delete.confirm" });

    expect(onDeleteStarted).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(actor.getSnapshot().matches("deleted")).toBe(true));
  });

  it("notifies the active route before a slow delete request finishes", async () => {
    const thread = makeThread();
    const onDeleteStarted = vi.fn();
    let releaseRemove: (() => void) | undefined;
    const machine = sidebarItemMachine.provide({
      actors: {
        remove: fromPromise(
          async (): Promise<void> =>
            new Promise<void>((resolve) => {
              releaseRemove = resolve;
            }),
        ),
      },
    });
    const actor = createActor(machine, { input: { thread, onDeleteStarted } });
    actor.start();

    actor.send({ type: "delete.request" });
    actor.send({ type: "delete.confirm" });

    expect(actor.getSnapshot().matches("deleting")).toBe(true);
    expect(onDeleteStarted).toHaveBeenCalledOnce();

    releaseRemove?.();
    await vi.waitFor(() => expect(actor.getSnapshot().matches("deleted")).toBe(true));
  });

  it("cancels delete confirmation", () => {
    const thread = makeThread();
    const actor = createActor(sidebarItemMachine, { input: { thread } });
    actor.start();

    actor.send({ type: "delete.request" });
    actor.send({ type: "delete.cancel" });

    expect(actor.getSnapshot().matches("idle")).toBe(true);
  });

  it("shares via navigator.share when available", async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const actor = createActor(sidebarItemMachine, { input: { thread: makeThread() } });
    actor.start();

    actor.send({ type: "share" });
    await vi.waitFor(() => expect(actor.getSnapshot().matches("idle")).toBe(true));

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Squat Session",
        url: expect.stringContaining("/chat/thread-1"),
      }),
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard when navigator.share is unavailable", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const actor = createActor(sidebarItemMachine, { input: { thread: makeThread() } });
    actor.start();

    actor.send({ type: "share" });
    await vi.waitFor(() => expect(actor.getSnapshot().matches("idle")).toBe(true));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/chat/thread-1"));
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

  it("pins and archives conversations through persisted state updates", async () => {
    const thread = makeThread();
    const onChanged = vi.fn();
    const machine = sidebarItemMachine.provide({
      actors: {
        updateState: fromPromise(async ({ input }) => ({
          ...thread,
          status: input.status ?? thread.status,
          pinned: input.pinned ?? thread.pinned,
        })),
      },
    });
    const actor = createActor(machine, { input: { thread, onChanged } });
    actor.start();

    actor.send({ type: "pin.toggle" });
    await vi.waitFor(() => expect(actor.getSnapshot().context.thread.pinned).toBe(true));
    actor.send({ type: "archive" });
    await vi.waitFor(() => expect(actor.getSnapshot().context.thread.status).toBe("archived"));

    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("opens a cloned conversation after its ancestry is copied", async () => {
    const thread = makeThread();
    const cloned = makeThread({ id: "thread-copy", title: "Squat Session copy" });
    const onCloned = vi.fn();
    const machine = sidebarItemMachine.provide({
      actors: { clone: fromPromise(async () => cloned) },
    });
    const actor = createActor(machine, { input: { thread, onCloned } });
    actor.start();

    actor.send({ type: "clone" });
    await vi.waitFor(() => expect(actor.getSnapshot().matches("idle")).toBe(true));

    expect(onCloned).toHaveBeenCalledWith("thread-copy");
  });
});
