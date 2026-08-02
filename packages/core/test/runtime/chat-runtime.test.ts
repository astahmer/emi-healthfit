import { describe, expect, it, vi } from "vitest";

import { createChatRuntime } from "../../src/runtime.export.ts";

const conversation = {
  id: "conversation-1",
  title: "First conversation",
  status: "regular" as const,
  pinned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
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
  () =>
  async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(url, "http://localhost").pathname;
    if (pathname === "/api/chat") return streamResponse();
    if (pathname === "/api/conversations") return response({ conversations: [conversation] });
    if (pathname === "/api/conversations/conversation-1")
      return response({ conversation, messages: [] });
    if (pathname === "/api/conversations/conversation-1/threads") return response({ threads: [] });
    if (pathname === "/api/memories") return response({ memories: [] });
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
}: {
  drafts?: ReturnType<typeof createStorage>;
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
      theme: "light",
    }),
  );
  const options = {
    transport: { baseUrl: "/api", fetch: createFetch() as typeof globalThis.fetch },
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
});
