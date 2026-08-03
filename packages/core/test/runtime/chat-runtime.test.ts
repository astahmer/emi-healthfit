import { describe, expect, it, vi } from "vitest";

import { createChatRuntime } from "../../src/runtime.export.ts";
import type { ChatMessage } from "../../src/protocol/messages.ts";

const conversation = {
  id: "conversation-1",
  title: "First conversation",
  status: "regular" as const,
  pinned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  parts: string;
  model: string | null;
  createdAt: string;
};

const memorySummary = {
  content: "The user prefers concise worker answers.",
  memoryCount: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const response = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });

const streamResponse = () => {
  const encoder = new TextEncoder();
  const chunks = [
    { type: "start", messageId: "assistant-1" },
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: "Hello" },
    { type: "text-end", id: "text-1" },
    { type: "finish" },
  ];
  return new Response(
    new ReadableStream<Uint8Array>({
      start: (controller) => {
        for (const chunk of chunks)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
};

const createFetch =
  ({ conversationMessages = [] }: { conversationMessages?: StoredMessage[] } = {}) =>
  async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(url, "http://localhost").pathname;
    if (pathname === "/api/chat") return streamResponse();
    if (pathname === "/api/chat/conversation-1/stream") return new Response(null, { status: 204 });
    if (pathname === "/api/conversations") return response({ conversations: [conversation] });
    if (pathname === "/api/conversations/conversation-1/messages/user-original")
      return response({ ok: true });
    if (pathname === "/api/conversations/conversation-1")
      return response({ conversation, messages: conversationMessages });
    if (pathname === "/api/conversations/conversation-1/threads") return response({ threads: [] });
    if (pathname === "/api/memories") return response({ memories: [] });
    if (pathname === "/api/memories/summary") {
      if (init?.method === "PATCH")
        return response({ summary: { ...memorySummary, content: "Updated summary." } });
      return response({ summary: memorySummary });
    }
    if (init?.method === "PATCH") return response({ conversation });
    throw new Error(`Unexpected runtime fixture request: ${pathname}`);
  };

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    get: (key: string) => values.get(key) ?? null,
    set: (key: string, value: string) => {
      values.set(key, value);
    },
    remove: (key: string) => {
      values.delete(key);
    },
  };
};

const createOptions = ({
  drafts = createStorage(),
  conversationMessages = [],
  onStreamCompleted,
}: {
  drafts?: ReturnType<typeof createStorage>;
  conversationMessages?: StoredMessage[];
  onStreamCompleted?: (input: {
    conversationId: string;
    message: ChatMessage;
    temporary: boolean;
  }) => void;
} = {}) => {
  const settings = createStorage();
  let onlineListener: ((online: boolean) => void) | undefined;
  settings.set(
    "emi-core-chat-settings",
    JSON.stringify({
      provider: "openai",
      apiKey: "test-key",
      baseUrl: "",
      model: "test-model",
      systemPrompt: "",
      titleModel: "test-model",
      titlePrompt: "",
      memoryEnabled: true,
      memoryModel: "test-model",
      webSearch: false,
      theme: "light",
    }),
  );
  const options = {
    transport: { baseUrl: "/api", fetch: createFetch({ conversationMessages }) },
    storage: { settings, drafts },
    browser: {
      online: true,
      subscribeOnline: (listener: (online: boolean) => void) => {
        onlineListener = listener;
        return () => {
          onlineListener = undefined;
        };
      },
    },
    identity: { createId: () => "user-1", now: () => "2026-01-01T00:00:00.000Z" },
    lifecycle: onStreamCompleted === undefined ? undefined : { onStreamCompleted },
  };
  return { options, setOnline: (online: boolean) => onlineListener?.(online) };
};

describe("createChatRuntime", () => {
  it("owns the actor graph behind stable state, commands, and lifecycle", async () => {
    const { options } = createOptions();
    const runtime = createChatRuntime(options);
    const notifications = vi.fn();
    const unsubscribe = runtime.subscribe(notifications);

    runtime.start();
    expect(runtime.getState().connection).toBe("online");
    expect(runtime.getState().activeThread.id).toBeUndefined();
    await vi.waitFor(() => {
      expect(runtime.getState().settings.apiKey).toBe("test-key");
      expect(runtime.getState().memories.summary).toEqual(memorySummary);
      expect(runtime.getState().ui.memorySummaryDraft).toBe(memorySummary.content);
    });

    runtime.actions.setMemorySummaryDraft({ draft: "Updated summary." });
    runtime.actions.saveMemorySummary();
    await vi.waitFor(() => {
      expect(runtime.getState().memories.summary?.content).toBe("Updated summary.");
      expect(runtime.getState().ui.memorySummaryDraft).toBe("Updated summary.");
    });

    runtime.actions.setDraft({ text: "Hello" });
    expect(runtime.getState().composer.text).toBe("Hello");
    runtime.actions.sendMessage({ text: "Hello" });

    await vi.waitFor(() => {
      expect(runtime.getState().activeThread.messages).toHaveLength(2);
      expect(runtime.getState().activeThread.isStreaming).toBe(false);
    });

    runtime.actions.selectConversation({ conversationId: "conversation-1" });
    await vi.waitFor(() => {
      expect(runtime.getState().activeConversation?.id).toBe("conversation-1");
    });

    expect(notifications).toHaveBeenCalled();
    expect("actorRef" in runtime).toBe(false);
    expect("getSnapshot" in runtime).toBe(false);

    runtime.stop();
    runtime.stop();
    unsubscribe();
    runtime.dispose();
    runtime.dispose();
  });

  it("routes browser changes and persistence failures through the facade", async () => {
    const drafts = createStorage();
    drafts.set = () => {
      throw new Error("Quota exceeded.");
    };
    const fixture = createOptions({ drafts });
    const runtime = createChatRuntime(fixture.options);

    runtime.start();
    runtime.actions.setDraft({ text: "Saved locally" });

    await vi.waitFor(() => {
      expect(runtime.getState().error).toBe("Quota exceeded.");
    });
    fixture.setOnline(false);
    expect(runtime.getState().connection).toBe("offline");

    runtime.dispose();
    fixture.setOnline(true);
    expect(runtime.getState().connection).toBe("offline");
  });

  it("keeps queued follow-up edit identity in the UI actor state", () => {
    const { options } = createOptions();
    const runtime = createChatRuntime(options);
    runtime.start();

    runtime.actions.beginEditingQueuedFollowUp({ id: "follow-up-1" });
    expect(runtime.getState().ui.editingQueuedFollowUpId).toBe("follow-up-1");

    runtime.actions.clearQueuedFollowUpEdit();
    expect(runtime.getState().ui.editingQueuedFollowUpId).toBeUndefined();
    runtime.dispose();
  });

  it("revises a user message through the core stream contract", async () => {
    const target = {
      id: "user-original",
      role: "user" as const,
      parts: JSON.stringify([{ type: "text", text: "Original" }]),
      model: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    } satisfies StoredMessage;
    const fixture = createOptions({ conversationMessages: [target] });
    let requestBody: unknown;
    let revisionBody: unknown;
    const baseFetch = fixture.options.transport.fetch;
    fixture.options.transport.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (init?.body !== undefined) {
        const body = JSON.parse(String(init.body));
        if (url.includes("/messages/")) revisionBody = body;
        else requestBody = body;
      }
      return baseFetch(input, init);
    };
    const runtime = createChatRuntime(fixture.options);

    runtime.start();
    runtime.actions.selectConversation({ conversationId: conversation.id });
    await vi.waitFor(() => {
      expect(runtime.getState().activeThread.messages).toHaveLength(1);
    });

    runtime.actions.editMessage({ messageId: target.id, text: "Revised" });
    await vi.waitFor(() =>
      expect(requestBody).toMatchObject({
        replaceMessageId: target.id,
        messages: [
          {
            id: target.id,
            parts: [{ type: "text", text: "Revised" }],
          },
        ],
      }),
    );
    await vi.waitFor(() => expect(runtime.getState().activeThread.isStreaming).toBe(false));

    expect(revisionBody).toEqual({
      parts: [{ type: "text", text: "Revised" }],
    });
    runtime.dispose();
  });

  it("notifies the lifecycle adapter only after a completed send stream", async () => {
    const target = {
      id: "user-original",
      role: "user" as const,
      parts: JSON.stringify([{ type: "text", text: "Original" }]),
      model: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    } satisfies StoredMessage;
    const onStreamCompleted = vi.fn();
    const fixture = createOptions({
      conversationMessages: [target],
      onStreamCompleted,
    });
    const runtime = createChatRuntime(fixture.options);

    runtime.start();
    runtime.actions.selectConversation({ conversationId: conversation.id });
    await vi.waitFor(() => {
      expect(runtime.getState().activeThread.messages).toHaveLength(1);
    });

    runtime.actions.sendMessage({ text: "New question" });
    await vi.waitFor(() => expect(onStreamCompleted).toHaveBeenCalledTimes(1));
    expect(onStreamCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: conversation.id, temporary: false }),
    );
    runtime.dispose();
  });
});
