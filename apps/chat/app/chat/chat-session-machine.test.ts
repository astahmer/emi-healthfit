import { createActor, fromPromise } from "xstate";
import { describe, expect, it, vi } from "vitest";
import { chatSessionMachine } from "./chat-session-machine";
import type { MessageWithUsage, Thread } from "../sessions";

const makeThread = (overrides?: Partial<Thread>): Thread => ({
  id: "thread-1",
  title: "Squat Session",
  status: "regular",
  created_at: "2026-07-14T11:37:55.245Z",
  updated_at: "2026-07-14T11:42:25.844Z",
  ...overrides,
});

const makeMessage = (overrides?: Partial<MessageWithUsage>): MessageWithUsage => ({
  id: "msg-1",
  role: "user",
  parts: [{ type: "text", text: "hello" }],
  ...overrides,
});

describe("chatSessionMachine", () => {
  it("starts in initializing and transitions to loading when sessionId is present", async () => {
    const thread = makeThread();
    const messages = [makeMessage()];
    const machine = chatSessionMachine.provide({
      actors: {
        loadThread: fromPromise(
          async (): Promise<{ thread: Thread; messages: MessageWithUsage[] }> => ({
            thread,
            messages,
          }),
        ),
      },
    });
    const actor = createActor(machine, { input: { sessionId: "thread-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches("active")).toBe(true));

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.thread).toEqual(thread);
    expect(snapshot.context.messages).toEqual(messages);
  });

  it("starts active with no sessionId", () => {
    const actor = createActor(chatSessionMachine, { input: { sessionId: undefined } });
    actor.start();

    expect(actor.getSnapshot().matches("active")).toBe(true);
    expect(actor.getSnapshot().context.thread).toBeNull();
    expect(actor.getSnapshot().context.messages).toEqual([]);
  });

  it("skips loading for a newly created session", () => {
    const actor = createActor(chatSessionMachine, {
      input: { sessionId: "thread-1", createdSessionId: "thread-1" },
    });
    actor.start();

    expect(actor.getSnapshot().matches("active")).toBe(true);
  });

  it("enters error state when loading fails", async () => {
    const machine = chatSessionMachine.provide({
      actors: {
        loadThread: fromPromise(
          async (): Promise<{ thread: Thread; messages: MessageWithUsage[] }> => {
            throw new Error("Network error");
          },
        ),
      },
    });
    const actor = createActor(machine, { input: { sessionId: "thread-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches("error")).toBe(true));
    expect(actor.getSnapshot().context.error?.message).toBe("Network error");
  });

  it("retries loading from error state", async () => {
    const thread = makeThread();
    let shouldFail = true;
    const machine = chatSessionMachine.provide({
      actors: {
        loadThread: fromPromise(
          async (): Promise<{ thread: Thread; messages: MessageWithUsage[] }> => {
            if (shouldFail) {
              throw new Error("Network error");
            }
            return { thread, messages: [] };
          },
        ),
      },
    });
    const actor = createActor(machine, { input: { sessionId: "thread-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches("error")).toBe(true));

    shouldFail = false;
    actor.send({ type: "retry" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches("active")).toBe(true));
    expect(actor.getSnapshot().context.thread).toEqual(thread);
  });

  it("renames the thread", async () => {
    const thread = makeThread();
    const machine = chatSessionMachine.provide({
      actors: {
        loadThread: fromPromise(
          async (): Promise<{ thread: Thread; messages: MessageWithUsage[] }> => ({
            thread,
            messages: [],
          }),
        ),
        rename: fromPromise(async (): Promise<void> => {}),
      },
    });
    const actor = createActor(machine, { input: { sessionId: "thread-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches("active")).toBe(true));

    actor.send({ type: "rename.start" });
    actor.send({ type: "rename.change", value: "New Title" });
    actor.send({ type: "rename.submit" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches("active")).toBe(true));
    expect(actor.getSnapshot().context.thread?.title).toBe("New Title");
    expect(actor.getSnapshot().context.renameDraft).toBe("");
  });

  it("does not submit rename with empty draft", async () => {
    const thread = makeThread();
    const machine = chatSessionMachine.provide({
      actors: {
        loadThread: fromPromise(
          async (): Promise<{ thread: Thread; messages: MessageWithUsage[] }> => ({
            thread,
            messages: [],
          }),
        ),
      },
    });
    const actor = createActor(machine, { input: { sessionId: "thread-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches("active")).toBe(true));

    actor.send({ type: "rename.start" });
    actor.send({ type: "rename.change", value: "   " });
    actor.send({ type: "rename.submit" });

    expect(actor.getSnapshot().matches("renaming")).toBe(true);
  });

  it("cancels rename", async () => {
    const thread = makeThread();
    const machine = chatSessionMachine.provide({
      actors: {
        loadThread: fromPromise(
          async (): Promise<{ thread: Thread; messages: MessageWithUsage[] }> => ({
            thread,
            messages: [],
          }),
        ),
      },
    });
    const actor = createActor(machine, { input: { sessionId: "thread-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches("active")).toBe(true));

    actor.send({ type: "rename.start" });
    actor.send({ type: "rename.change", value: "Draft" });
    actor.send({ type: "rename.cancel" });

    expect(actor.getSnapshot().matches("active")).toBe(true);
    expect(actor.getSnapshot().context.renameDraft).toBe("");
  });

  it("updates sidebar width and persists it", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });

    const actor = createActor(chatSessionMachine, { input: { sessionId: undefined } });
    actor.start();

    actor.send({ type: "sidebar.widthChanged", width: 20 });

    expect(actor.getSnapshot().context.sidebarWidth).toBe(20);
    expect(storage.get("emi-sidebar-width")).toBe("20");

    vi.unstubAllGlobals();
  });

  it("reads persisted sidebar width on init", () => {
    const storage = new Map<string, string>([["emi-sidebar-width", "24"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });

    const actor = createActor(chatSessionMachine, { input: { sessionId: undefined } });
    actor.start();

    expect(actor.getSnapshot().context.sidebarWidth).toBe(24);

    vi.unstubAllGlobals();
  });

  it("transitions to exporting and back", async () => {
    const thread = makeThread();
    const messages = [makeMessage()];
    const machine = chatSessionMachine.provide({
      actors: {
        loadThread: fromPromise(async () => ({ thread, messages })),
      },
    });
    const actor = createActor(machine, { input: { sessionId: "thread-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches("active")).toBe(true));

    actor.send({ type: "export" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches("active")).toBe(true));
  });

  it("increments resetKey on reset", () => {
    const actor = createActor(chatSessionMachine, { input: { sessionId: undefined } });
    actor.start();

    actor.send({ type: "reset" });

    expect(actor.getSnapshot().context.resetKey).toBe(1);
  });
});
