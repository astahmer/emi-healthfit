import { createActor, fromPromise } from "xstate";
import { describe, expect, it, vi } from "vitest";
import {
  conversationMachine,
  type Conversation,
  type MessageNode,
  type ThreadView,
} from "./conversation-machine";

const makeConversation = (overrides?: Partial<Conversation>): Conversation => ({
  id: "conv-1",
  title: "Test conversation",
  status: "regular",
  createdAt: "2026-07-14T10:00:00.000Z",
  updatedAt: "2026-07-14T10:00:00.000Z",
  ...overrides,
});

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

describe("conversationMachine", () => {
  it("starts ready when no conversation id is provided", () => {
    const actor = createActor(conversationMachine, { input: {} });
    actor.start();

    expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true);
    expect(actor.getSnapshot().context.conversation).toBeNull();
  });

  it("loads a conversation when an id is provided", async () => {
    const conversation = makeConversation();
    const messages = [makeMessage()];
    const threads = [makeThread()];
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async () => ({ conversation, messages, threads })),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.conversation).toEqual(conversation);
    expect(snapshot.context.messages).toEqual(messages);
    expect(snapshot.context.threads).toEqual(threads);
  });

  it("skips loading in temporary mode", () => {
    const actor = createActor(conversationMachine, {
      input: { conversationId: "conv-1", isTemporary: true },
    });
    actor.start();

    expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true);
    expect(actor.getSnapshot().context.conversation).toBeNull();
  });

  it("enters error state when loading fails and retries", async () => {
    let shouldFail = true;
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(
          async (): Promise<{
            conversation: Conversation;
            messages: MessageNode[];
            threads: ThreadView[];
          }> => {
            if (shouldFail) throw new Error("Network error");
            return { conversation: makeConversation(), messages: [], threads: [] };
          },
        ),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches("error")).toBe(true));
    expect(actor.getSnapshot().context.error?.message).toBe("Network error");

    shouldFail = false;
    actor.send({ type: "retry" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));
  });

  it("focuses a thread", async () => {
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async () => ({
          conversation: makeConversation(),
          messages: [makeMessage()],
          threads: [makeThread()],
        })),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    actor.send({ type: "thread.focus", threadId: "thread-1" });

    expect(actor.getSnapshot().context.focusedThreadId).toBe("thread-1");
  });

  it("forks a thread and focuses it", async () => {
    const forked = makeThread({ id: "thread-2", anchorMessageId: "msg-1" });
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async () => ({
          conversation: makeConversation(),
          messages: [makeMessage()],
          threads: [makeThread()],
        })),
        forkThread: fromPromise(async () => forked),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    actor.send({ type: "thread.fork", anchorMessageId: "msg-1", title: "Fork" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.threads).toContainEqual(forked);
    expect(snapshot.context.focusedThreadId).toBe("thread-2");
  });

  it("renames a thread", async () => {
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async () => ({
          conversation: makeConversation(),
          messages: [makeMessage()],
          threads: [makeThread()],
        })),
        renameThread: fromPromise(async () => ({ threadId: "thread-1", title: "New Title" })),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    actor.send({ type: "thread.rename", threadId: "thread-1", title: "New Title" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    const thread = actor.getSnapshot().context.threads.find((t) => t.id === "thread-1");
    expect(thread?.title).toBe("New Title");
  });

  it("pins a thread", async () => {
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async () => ({
          conversation: makeConversation(),
          messages: [makeMessage()],
          threads: [makeThread()],
        })),
        pinThread: fromPromise(
          async (): Promise<{ threadId: string; pinned: boolean }> => ({
            threadId: "thread-1",
            pinned: true,
          }),
        ),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    actor.send({ type: "thread.pin", threadId: "thread-1", pinned: true });

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    const thread = actor.getSnapshot().context.threads.find((t) => t.id === "thread-1");
    expect(thread?.pinned).toBe(true);
  });

  it("discards a thread", async () => {
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async () => ({
          conversation: makeConversation(),
          messages: [makeMessage()],
          threads: [makeThread()],
        })),
        discardThread: fromPromise(async () => ({ threadId: "thread-1" })),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    actor.send({ type: "thread.discard", threadId: "thread-1" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    const thread = actor.getSnapshot().context.threads.find((t) => t.id === "thread-1");
    expect(thread?.status).toBe("discarded");
  });

  it("summarizes a thread by adding a summary message", async () => {
    const summary = makeMessage({
      id: "summary-1",
      role: "summary",
      parts: [{ type: "text", text: "TL;DR" }],
    });
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async () => ({
          conversation: makeConversation(),
          messages: [makeMessage()],
          threads: [makeThread()],
        })),
        summarizeThread: fromPromise(async () => ({ message: summary })),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    actor.send({ type: "thread.summarize", threadId: "thread-1" });

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    expect(actor.getSnapshot().context.messages).toContainEqual(summary);
  });

  it("searches messages", async () => {
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(
          async (): Promise<{
            conversation: Conversation;
            messages: MessageNode[];
            threads: ThreadView[];
          }> => ({
            conversation: makeConversation(),
            messages: [
              makeMessage({ id: "a", parts: [{ type: "text", text: "hello world" }] }),
              makeMessage({ id: "b", parts: [{ type: "text", text: "goodbye" }] }),
            ],
            threads: [],
          }),
        ),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    actor.send({ type: "search.query", query: "hello" });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.searchQuery).toBe("hello");
    expect(snapshot.context.searchResults.map((m) => m.id)).toEqual(["a"]);
  });

  it("switches view mode", async () => {
    const actor = createActor(conversationMachine, { input: {} });
    actor.start();

    actor.send({ type: "view.select", viewMode: "columns" });

    expect(actor.getSnapshot().context.viewMode).toBe("columns");
  });

  it("reloads when conversation id changes", async () => {
    const second = makeConversation({ id: "conv-2", title: "Second" });
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async ({ input }) => {
          if (input.conversationId === "conv-2") {
            return { conversation: second, messages: [], threads: [] };
          }
          return { conversation: makeConversation(), messages: [], threads: [] };
        }),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    actor.send({ type: "conversationId.changed", conversationId: "conv-2" });

    await vi.waitFor(() => expect(actor.getSnapshot().context.conversation?.id).toBe("conv-2"));
    expect(actor.getSnapshot().context.conversation?.title).toBe("Second");
  });

  it("clears data when conversation id is removed", async () => {
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async () => ({
          conversation: makeConversation(),
          messages: [makeMessage()],
          threads: [makeThread()],
        })),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    actor.send({ type: "conversationId.changed", conversationId: undefined });

    expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true);
    expect(actor.getSnapshot().context.conversation).toBeNull();
    expect(actor.getSnapshot().context.messages).toEqual([]);
  });

  it("clears persisted data when temporary mode is enabled", async () => {
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async () => ({
          conversation: makeConversation(),
          messages: [makeMessage()],
          threads: [makeThread()],
        })),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    actor.send({ type: "temporary.changed", isTemporary: true });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.isTemporary).toBe(true);
    expect(snapshot.context.conversation).toBeNull();
    expect(snapshot.context.messages).toEqual([]);
    expect(snapshot.context.threads).toEqual([]);
    expect(snapshot.context.focusedThreadId).toBeNull();
  });

  it("resets to remount state without losing data", async () => {
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async () => ({
          conversation: makeConversation(),
          messages: [makeMessage()],
          threads: [makeThread()],
        })),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches({ ready: "idle" })).toBe(true));

    actor.send({ type: "reset" });

    expect(actor.getSnapshot().context.resetKey).toBe(1);
    expect(actor.getSnapshot().context.conversation).not.toBeNull();
    expect(actor.getSnapshot().context.messages.length).toBe(1);
  });
});
