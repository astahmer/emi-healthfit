import { createActor } from "xstate";
import { describe, expect, it, vi } from "vitest";

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
  createMemory: async () => "memory-1",
  deleteMemory: async () => undefined,
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
  it("routes a transport stream through its session child without mirroring child context", async () => {
    const actor = createActor(genericChatAppMachine, {
      input: {
        api: "https://chat.example/api/chat",
        fetch: async () => assistantResponse(),
        createId: () => "user-message",
        client,
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
        client,
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
});
