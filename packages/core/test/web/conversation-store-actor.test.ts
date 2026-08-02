import { createActor } from "xstate";
import { describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "../../src/protocol/index.ts";
import type { ChatSessionEvent } from "../../src/web/chat-session-machine.ts";
import type {
  Conversation,
  ConversationClient,
  ConversationThread,
  Memory,
} from "../../src/web/chat-runtime/conversation-client.ts";
import { conversationStoreActor } from "../../src/web/chat-runtime/conversation-store-actor.ts";

const conversation: Conversation = {
  id: "conversation-1",
  title: "First conversation",
  status: "regular",
  pinned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const thread: ConversationThread = {
  id: "thread-1",
  conversationId: conversation.id,
  anchorMessageId: "message-1",
  title: "Branch",
  status: "regular",
  pinned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const memory: Memory = {
  id: "memory-1",
  content: "Prefers concise answers.",
  source: null,
  threadId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  rank: 1,
};

const message: ChatMessage = {
  id: "message-1",
  role: "user",
  parts: [{ type: "text", text: "Hello" }],
  createdAt: "2026-01-01T00:00:00.000Z",
};

const createClient = (overrides: Partial<ConversationClient> = {}): ConversationClient => ({
  listConversations: async () => [conversation],
  loadConversation: async () => ({ conversation, messages: [message] }),
  updateConversation: async () => conversation,
  deleteConversation: async () => undefined,
  cloneConversation: async () => conversation,
  compactConversation: async () => conversation,
  listMemories: async () => [memory],
  createMemory: async () => memory.id,
  deleteMemory: async () => undefined,
  listThreads: async () => [thread],
  createThread: async () => thread,
  loadThread: async () => ({ thread, messages: [message] }),
  ...overrides,
});

const createStore = ({ client = createClient() }: { client?: ConversationClient } = {}) => {
  const sessionEvents: ChatSessionEvent[] = [];
  const actor = createActor(conversationStoreActor, {
    input: {
      client,
      sendSession: (event) => sessionEvents.push(event),
      sendTransport: () => undefined,
    },
  }).start();
  return { actor, sessionEvents };
};

const deferred = <Value>() => {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

describe("conversationStoreActor", () => {
  it("loads conversations and memories when started", async () => {
    const { actor } = createStore();

    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.conversations).toEqual([conversation]);
      expect(actor.getSnapshot().context.memories).toEqual([memory]);
    });

    expect(actor.getSnapshot().context.loading).toMatchObject({
      conversations: false,
      memories: false,
    });
    actor.stop();
  });

  it("reports a rejected mutation through store and session state", async () => {
    const { actor, sessionEvents } = createStore({
      client: createClient({
        updateConversation: async () => Promise.reject(new Error("Denied.")),
      }),
    });

    actor.send({
      type: "conversation-update-requested",
      conversationId: conversation.id,
      patch: { pinned: true },
    });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.error).toBe("Denied.");
    });

    expect(sessionEvents).toContainEqual({ type: "error-reported", error: "Denied." });
    expect(actor.getSnapshot().context.loading.mutation).toBe(false);
    actor.stop();
  });

  it("emits one typed success event for a successful conversation deletion", async () => {
    let deleteCalls = 0;
    const { actor, sessionEvents } = createStore({
      client: createClient({
        deleteConversation: async () => {
          deleteCalls += 1;
        },
      }),
    });

    await vi.waitFor(() =>
      expect(actor.getSnapshot().context.conversations).toEqual([conversation]),
    );
    actor.send({
      type: "conversation-delete-requested",
      conversationId: conversation.id,
      resetSession: true,
    });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.conversations).toEqual([]);
      expect(actor.getSnapshot().context.loading.mutation).toBe(false);
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(deleteCalls).toBe(1);
    expect(sessionEvents).toContainEqual({ type: "fresh-started" });
    actor.stop();
  });

  it("keeps the newest conversation search result when responses finish out of order", async () => {
    const oldResult = deferred<Conversation[]>();
    const newResult = deferred<Conversation[]>();
    const oldConversation = { ...conversation, id: "old-conversation" };
    const newConversation = { ...conversation, id: "new-conversation" };
    const { actor } = createStore({
      client: createClient({
        listConversations: async ({ search }) => {
          if (search === "old") return oldResult.promise;
          if (search === "new") return newResult.promise;
          return [];
        },
      }),
    });

    actor.send({ type: "conversations-load-requested", search: "old" });
    actor.send({ type: "conversations-load-requested", search: "new" });
    newResult.resolve([newConversation]);

    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.conversations).toEqual([newConversation]);
    });

    oldResult.resolve([oldConversation]);
    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.conversations).toEqual([newConversation]);
    });
    actor.stop();
  });

  it("creates a branch, refreshes branches, and opens it through a session event", async () => {
    const { actor, sessionEvents } = createStore();

    actor.send({
      type: "thread-create-requested",
      conversationId: conversation.id,
      anchorMessageId: message.id,
    });

    await vi.waitFor(() => {
      expect(sessionEvents).toContainEqual({
        type: "thread-opened",
        threadId: thread.id,
        messages: [message],
      });
    });

    expect(actor.getSnapshot().context.threads).toEqual([thread]);
    actor.stop();
  });

  it("refreshes memories after creating one and removes deleted memories", async () => {
    let memories: Memory[] = [];
    const client = createClient({
      listMemories: async () => memories,
      createMemory: async () => {
        memories = [memory];
        return memory.id;
      },
      deleteMemory: async () => {
        memories = [];
      },
    });
    const { actor } = createStore({ client });

    actor.send({ type: "memory-create-requested", content: memory.content, search: "" });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.memories).toEqual([memory]);
    });

    actor.send({ type: "memory-delete-requested", memoryId: memory.id });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.memories).toEqual([]);
    });
    actor.stop();
  });
});
