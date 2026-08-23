import { createActor, fromPromise } from "xstate";
import { describe, expect, it, vi } from "vitest";
import { conversationMachine } from "../../src/web/conversation/conversation-machine.ts";
import type { ConversationLoadOutput } from "../../src/web/conversation/conversation-machine.ts";
import type {
  ChatConversation,
  ChatMessageNode,
  ChatThreadView,
} from "../../src/web/conversation-snapshot.ts";

const conversation: ChatConversation = {
  id: "conv-1",
  title: "Test",
  status: "regular",
  createdAt: "2026-07-14T10:00:00.000Z",
  updatedAt: "2026-07-14T10:00:00.000Z",
};

const message = (id: string, text: string): ChatMessageNode => ({
  id,
  conversationId: "conv-1",
  parentId: null,
  role: "user",
  parts: [{ type: "text", text }],
  createdAt: "2026-07-14T10:01:00.000Z",
});

const thread: ChatThreadView = {
  id: "thread-1",
  conversationId: "conv-1",
  anchorMessageId: "message-1",
  title: null,
  status: "regular",
  pinned: false,
  messageIds: ["message-1"],
  createdAt: "2026-07-14T10:01:00.000Z",
  updatedAt: "2026-07-14T10:01:00.000Z",
};

const snapshot = {
  conversation,
  messages: [message("message-1", "hello squats"), message("message-2", "more cardio")],
  threads: [thread],
};

describe("conversationMachine policy", () => {
  it("starts ready with cleared data when no conversation id is provided", () => {
    const actor = createActor(conversationMachine, { input: {} });
    actor.start();

    expect(actor.getSnapshot().matches("ready")).toBe(true);
    expect(actor.getSnapshot().context.conversation).toBeNull();
    expect(actor.getSnapshot().context.messages).toEqual([]);
  });

  it("skips loading and keeps no persisted data in temporary mode", () => {
    const loadConversation = vi.fn();
    const machine = conversationMachine.provide({
      actors: { loadConversation: fromPromise(loadConversation) },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1", isTemporary: true } });
    actor.start();

    expect(actor.getSnapshot().matches("ready")).toBe(true);
    expect(loadConversation).not.toHaveBeenCalled();
  });

  it("loads a conversation and flags a network refresh after a cached load", async () => {
    const refreshImpl = vi.fn(
      async (_: {
        input: { conversationId: string | undefined; enabled: boolean };
      }): Promise<Omit<ConversationLoadOutput, "source"> | undefined> => snapshot,
    );
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async (): Promise<ConversationLoadOutput> => ({
          ...snapshot,
          source: "cache",
        })),
        refreshConversation: fromPromise(refreshImpl),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches("ready")).toBe(true));
    expect(actor.getSnapshot().context.messages).toHaveLength(2);
    await vi.waitFor(() => expect(refreshImpl.mock.calls.length).toBeGreaterThan(0));
    const [refreshCall] = refreshImpl.mock.calls;
    expect(refreshCall?.[0]?.input).toEqual({
      conversationId: "conv-1",
      enabled: true,
    });

    actor.send({ type: "conversationId.changed", conversationId: "conv-2" });
    actor.send({ type: "load.succeeded", ...snapshot });
    expect(actor.getSnapshot().context.refreshFromNetwork).toBe(false);
  });

  it("ignores a stale load result for a conversation that is no longer selected", async () => {
    const resolvers: Array<(output: typeof snapshot) => void> = [];
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(
          () => new Promise<typeof snapshot>((resolve) => resolvers.push(resolve)),
        ),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();
    expect(actor.getSnapshot().matches("loading")).toBe(true);

    actor.send({ type: "conversationId.changed", conversationId: "conv-2" });
    await vi.waitFor(() => expect(resolvers.length).toBe(2));

    resolvers[0]?.(snapshot);
    await vi.waitFor(() => expect(resolvers.length).toBe(2));
    expect(actor.getSnapshot().context.conversation).toBeNull();

    resolvers[1]?.({ ...snapshot, conversation: { ...conversation, id: "conv-2" } });
    await vi.waitFor(() => expect(actor.getSnapshot().context.conversation?.id).toBe("conv-2"));
  });

  it("filters messages through search queries and restores on clear", async () => {
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async (): Promise<ConversationLoadOutput> => ({
          ...snapshot,
          source: "network",
        })),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();
    await vi.waitFor(() => expect(actor.getSnapshot().matches("ready")).toBe(true));

    actor.send({ type: "search.query", query: "squats" });
    expect(actor.getSnapshot().context.searchResults.map((item) => item.id)).toEqual(["message-1"]);

    actor.send({ type: "search.query", query: "" });
    expect(actor.getSnapshot().context.searchResults).toHaveLength(0);
  });

  it("switches view modes", async () => {
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async (): Promise<ConversationLoadOutput> => ({
          ...snapshot,
          source: "network",
        })),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();
    await vi.waitFor(() => expect(actor.getSnapshot().matches("ready")).toBe(true));

    actor.send({ type: "view.select", viewMode: "columns" });
    expect(actor.getSnapshot().context.viewMode).toBe("columns");
  });

  it("clears persisted data when temporary mode turns on mid-conversation", async () => {
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async (): Promise<ConversationLoadOutput> => ({
          ...snapshot,
          source: "network",
        })),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();
    await vi.waitFor(() => expect(actor.getSnapshot().context.messages).toHaveLength(2));

    actor.send({ type: "temporary.changed", isTemporary: true });
    expect(actor.getSnapshot().context.conversation).toBeNull();
    expect(actor.getSnapshot().context.messages).toEqual([]);
    expect(actor.getSnapshot().context.threads).toEqual([]);
  });

  it("recovers from load errors through retry", async () => {
    let attempt = 0;
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async (): Promise<ConversationLoadOutput> => {
          attempt += 1;
          if (attempt === 1) throw new Error("offline");
          return { ...snapshot, source: "network" };
        }),
      },
    });
    const actor = createActor(machine, { input: { conversationId: "conv-1" } });
    actor.start();

    await vi.waitFor(() => expect(actor.getSnapshot().matches("error")).toBe(true));
    expect(actor.getSnapshot().context.error?.message).toBe("offline");

    actor.send({ type: "retry" });
    await vi.waitFor(() => expect(actor.getSnapshot().matches("ready")).toBe(true));
    expect(attempt).toBe(2);
  });

  it("keeps new-chat navigation suppressed until a session is created", async () => {
    const actor = createActor(conversationMachine, { input: {} });
    actor.start();

    actor.send({ type: "new-chat.requested" });
    expect(actor.getSnapshot().context.suppressNextSessionNavigation).toBe(true);

    actor.send({ type: "session.created", conversationId: "conv-new" });
    expect(actor.getSnapshot().context.suppressNextSessionNavigation).toBe(false);
    expect(actor.getSnapshot().context.createdConversationId).toBe("conv-new");
  });

  it("forks a thread, focuses it, and notifies the branch listener", async () => {
    const onBranchCreated = vi.fn();
    const created: ChatThreadView = { ...thread, id: "thread-2", messageIds: ["message-2"] };
    const machine = conversationMachine.provide({
      actors: {
        loadConversation: fromPromise(async (): Promise<ConversationLoadOutput> => ({
          ...snapshot,
          source: "network",
        })),
        forkThread: fromPromise(async () => created),
      },
    });
    const actor = createActor(machine, {
      input: { conversationId: "conv-1", onBranchCreated },
    });
    actor.start();
    await vi.waitFor(() => expect(actor.getSnapshot().matches("ready")).toBe(true));

    actor.send({ type: "thread.fork", anchorMessageId: "message-2" });
    await vi.waitFor(() =>
      expect(actor.getSnapshot().context.threads.map((item) => item.id)).toEqual([
        "thread-1",
        "thread-2",
      ]),
    );
    expect(actor.getSnapshot().context.focusedThreadId).toBe("thread-2");
    expect(onBranchCreated).toHaveBeenCalledWith(created);
  });
});
