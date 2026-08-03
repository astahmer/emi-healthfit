import { createActor } from "xstate";
import { describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "../../src/protocol/messages.ts";
import { genericChatAppMachine } from "../../src/web/chat-runtime/generic-chat-app-machine.ts";
import type { ConversationClient } from "../../src/web/chat-runtime/conversation-client.ts";

const client: ConversationClient = {
  listConversations: async () => [],
  loadConversation: async () => ({
    conversation: {
      id: "conversation-1",
      title: null,
      status: "regular",
      pinned: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    messages: [],
  }),
  updateConversation: async () => ({
    id: "conversation-1",
    title: null,
    status: "regular",
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }),
  deleteConversation: async () => undefined,
  cloneConversation: async () => ({
    id: "conversation-1",
    title: null,
    status: "regular",
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }),
  compactConversation: async () => ({
    id: "conversation-1",
    title: null,
    status: "regular",
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }),
  listMemories: async () => [],
  loadMemorySummary: async () => undefined,
  updateMemorySummary: async () => ({
    content: "",
    memoryCount: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
  }),
  createMemory: async () => "memory-1",
  deleteMemory: async () => undefined,
  generateSuggestions: async () => [],
  listThreads: async () => [],
  createThread: async () => ({
    id: "thread-1",
    conversationId: "conversation-1",
    anchorMessageId: "message-1",
    title: null,
    status: "regular",
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }),
  loadThread: async () => ({
    thread: {
      id: "thread-1",
      conversationId: "conversation-1",
      anchorMessageId: "message-1",
      title: null,
      status: "regular",
      pinned: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    messages: [],
  }),
};

const rootAdapters = {
  storage: { getItem: () => null, setItem: () => undefined },
  storageKey: "settings",
  draftStorageKey: "draft",
  browser: {
    online: () => true,
    subscribeOnline: () => () => undefined,
    storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  },
};

const assistantResponse = () =>
  new Response(
    new ReadableStream<Uint8Array>({
      start: (controller) => {
        const encoder = new TextEncoder();
        for (const chunk of [
          { type: "start", messageId: "assistant" },
          { type: "text-start", id: "text" },
          { type: "text-delta", id: "text", delta: "Hello" },
          { type: "text-end", id: "text" },
          { type: "finish" },
        ]) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        controller.close();
      },
    }),
  );

describe("genericChatAppMachine", () => {
  it("routes restored browser drafts to the session child", async () => {
    const actor = createActor(genericChatAppMachine, {
      input: {
        api: "https://chat.example/api/chat",
        fetch: async () => assistantResponse(),
        createId: () => "user-message",
        now: () => "2026-01-01T00:00:00.000Z",
        client,
        ...rootAdapters,
        browser: {
          ...rootAdapters.browser,
          storage: {
            ...rootAdapters.browser.storage,
            getItem: () => "restored draft",
          },
        },
      },
    }).start();

    const session = actor.getSnapshot().children.session;
    await vi.waitFor(() => expect(session?.getSnapshot().context.draft).toBe("restored draft"));
    actor.stop();
  });

  it("routes a transport stream through its session child without mirroring child context", async () => {
    const actor = createActor(genericChatAppMachine, {
      input: {
        api: "https://chat.example/api/chat",
        fetch: async () => assistantResponse(),
        createId: () => "user-message",
        now: () => "2026-01-01T00:00:00.000Z",
        client,
        ...rootAdapters,
      },
    }).start();

    actor.send({
      type: "transport-event",
      event: {
        type: "stream-send-requested",
        request: {
          conversationId: undefined,
          threadId: undefined,
          temporary: false,
          messages: [],
          text: "Hi",
          files: [],
          body: {},
        },
      },
    });

    const session = actor.getSnapshot().children.session;
    await vi.waitFor(() => {
      expect(session?.getSnapshot().matches("idle")).toBe(true);
    });

    expect(session?.getSnapshot().context.messages).toHaveLength(2);
    expect(Object.hasOwn(actor.getSnapshot().context, "messages")).toBe(false);
    actor.stop();
  });

  it("routes conversation store session events without copying its lists into parent context", async () => {
    const actor = createActor(genericChatAppMachine, {
      input: {
        api: "https://chat.example/api/chat",
        fetch: async () => assistantResponse(),
        createId: () => "user-message",
        now: () => "2026-01-01T00:00:00.000Z",
        client,
        ...rootAdapters,
      },
    }).start();

    actor.send({
      type: "conversation-store-event",
      event: { type: "conversation-load-requested", conversationId: "conversation-1" },
    });

    const session = actor.getSnapshot().children.session;
    await vi.waitFor(() => {
      expect(session?.getSnapshot().context.conversationId).toBe("conversation-1");
    });

    expect(Object.hasOwn(actor.getSnapshot().context, "conversations")).toBe(false);
    actor.stop();
  });

  it("reconciles a persisted assistant when a conversation resumes with a new message id", async () => {
    const persistedMessages: ChatMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "persisted-assistant",
        role: "assistant",
        parts: [{ type: "text", text: "Partial answer" }],
        createdAt: "2026-01-01T00:00:01.000Z",
      },
    ];
    const actor = createActor(genericChatAppMachine, {
      input: {
        api: "https://chat.example/api/chat",
        fetch: async (input) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          if (new URL(url).pathname === "/api/chat/conversation-1/stream")
            return assistantResponse();
          throw new Error(`Unexpected runtime fixture request: ${url}`);
        },
        createId: () => "user-message",
        now: () => "2026-01-01T00:00:00.000Z",
        client: {
          ...client,
          loadConversation: async () => {
            const loaded = await client.loadConversation({ conversationId: "conversation-1" });
            return { conversation: loaded.conversation, messages: persistedMessages };
          },
        },
        ...rootAdapters,
      },
    }).start();

    actor.send({
      type: "conversation-store-event",
      event: { type: "conversation-load-requested", conversationId: "conversation-1" },
    });

    const session = actor.getSnapshot().children.session;
    await vi.waitFor(() => {
      expect(session?.getSnapshot().context.messages.at(-1)?.id).toBe("assistant");
      expect(session?.getSnapshot().matches("idle")).toBe(true);
    });
    expect(session?.getSnapshot().context.messages).toHaveLength(2);
    actor.stop();
  });
});
