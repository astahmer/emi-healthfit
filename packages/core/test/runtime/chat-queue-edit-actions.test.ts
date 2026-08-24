import { describe, expect, it, vi } from "vitest";

import { createChatRuntime } from "../../src/runtime.export.ts";
import type {
  ChatQueueSyncAdapter,
  ChatQueueSyncPayload,
} from "../../src/runtime.export.ts";
import type { Attachment } from "../../src/protocol/parts.ts";

const attachment: Attachment = {
  id: "attachment:https://example.com/a.txt",
  name: "a.txt",
  mediaType: "text/plain",
  url: "https://example.com/a.txt",
};

const createOptions = () => {
  const settings = new Map<string, string>();
  const drafts = new Map<string, string>();
  const mapStorage = (store: Map<string, string>) => ({
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    set: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    },
    remove: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
  });
  return {
    transport: {
      baseUrl: "/api",
      fetch: async () => new Response("{}", { status: 500 }),
    },
    storage: { settings: mapStorage(settings), drafts: mapStorage(drafts) },
    browser: {
      online: true,
      subscribeOnline: () => () => undefined,
    },
    identity: {
      createId: () => "generated-id",
      now: () => "2026-01-01T00:00:00.000Z",
    },
  };
};

describe("queued follow-up edit actions", () => {
  it("beginQueuedFollowUpEditWithDraft restores the queued text and attachments", () => {
    const runtime = createChatRuntime(createOptions());
    runtime.start();

    runtime.actions.replaceQueuedFollowUps({
      items: [{ id: "item-1", text: "queued text", attachments: [attachment] }],
    });
    runtime.actions.setDraft({ text: "unrelated draft" });
    runtime.actions.addAttachments({ attachments: [{ ...attachment, id: "attachment:other" }] });

    runtime.actions.beginQueuedFollowUpEditWithDraft({ id: "item-1" });

    const state = runtime.getState();
    expect(state.ui.editingQueuedFollowUpId).toBe("item-1");
    expect(state.composer.text).toBe("queued text");
    expect(state.composer.attachments).toEqual([attachment]);

    runtime.stop();
    runtime.dispose();
  });

  it("commitQueuedFollowUpEdit updates the item and resets the composer", () => {
    const runtime = createChatRuntime(createOptions());
    runtime.start();

    runtime.actions.setTemporary({ temporary: true });
    runtime.actions.replaceQueuedFollowUps({
      items: [{ id: "item-1", text: "old text", attachments: [] }],
    });
    runtime.actions.beginEditingQueuedFollowUp({ id: "item-1" });
    runtime.actions.setDraft({ text: "new text" });
    runtime.actions.addAttachments({ attachments: [attachment] });

    runtime.actions.commitQueuedFollowUpEdit({
      id: "item-1",
      text: "new text",
      attachments: [attachment],
    });

    const state = runtime.getState();
    expect(state.queuedFollowUps).toEqual([
      { id: "item-1", text: "new text", attachments: [attachment] },
    ]);
    expect(state.ui.editingQueuedFollowUpId).toBeUndefined();
    expect(state.composer.text).toBe("");
    expect(state.composer.attachments).toEqual([]);

    runtime.stop();
    runtime.dispose();
  });

  it("discardQueuedFollowUpEdit clears the edit without touching the queue", () => {
    const runtime = createChatRuntime(createOptions());
    runtime.start();

    runtime.actions.setTemporary({ temporary: true });
    runtime.actions.replaceQueuedFollowUps({
      items: [{ id: "item-1", text: "kept", attachments: [] }],
    });
    runtime.actions.beginEditingQueuedFollowUp({ id: "item-1" });
    runtime.actions.setDraft({ text: "scratch" });
    runtime.actions.addAttachments({ attachments: [attachment] });

    runtime.actions.discardQueuedFollowUpEdit();

    const state = runtime.getState();
    expect(state.queuedFollowUps).toEqual([{ id: "item-1", text: "kept", attachments: [] }]);
    expect(state.ui.editingQueuedFollowUpId).toBeUndefined();
    expect(state.composer.text).toBe("");
    expect(state.composer.attachments).toEqual([]);

    runtime.stop();
    runtime.dispose();
  });
});
describe("queued follow-up send lifecycle regressions", () => {
  const streamResponse = (text: string) => {
    const encoder = new TextEncoder();
    const messageId = `assistant-${Math.random().toString(36).slice(2, 8)}`;
    return new Response(
      new ReadableStream<Uint8Array>({
        start: (controller) => {
          for (const chunk of [
            { type: "start", messageId },
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: text },
            { type: "text-end", id: "text-1" },
            { type: "finish" },
          ])
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          controller.close();
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  };

  const createStreamingOptions = () => {
    const base = createOptions();
    const settingsStore = (base.storage.settings as {
      get: (key: string) => Promise<string | null>;
    }) satisfies { get: (key: string) => Promise<string | null> };
    void settingsStore;
    const settingsBacking = new Map<string, string>();
    settingsBacking.set(
      "emi-core-chat-settings",
      JSON.stringify({
        provider: "openai",
        apiKey: "test-key",
        baseUrl: "",
        model: "test-model",
        systemPrompt: "",
        titleModel: "test-model",
        titlePrompt: "",
        memoryEnabled: false,
        memoryModel: "test-model",
        webSearch: false,
        theme: "light",
      }),
    );
    const wrappedSettings = {
      get: (key: string) => settingsBacking.get(key) ?? null,
      set: (key: string, value: string) => {
        settingsBacking.set(key, value);
      },
      remove: (key: string) => {
        settingsBacking.delete(key);
      },
    };
    const chatRequests: string[] = [];
    let gate: Promise<void> | undefined;
    let release: (() => void) | undefined;
    let callCount = 0;
    const holdFirstStream = () => {
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    };
    const transportFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/chat") && init?.method === "POST") {
        callCount += 1;
        if (callCount === 1 && gate !== undefined) {
          await gate;
          return streamResponse("first reply");
        }
        chatRequests.push(url);
        return streamResponse("queued reply");
      }
      if (url.endsWith("/stream")) return new Response(null, { status: 204 });
      throw new Error(`Unexpected request in streaming fixture: ${url}`);
    };
    return {
      transport: { ...base.transport, fetch: transportFetch },
      storage: { settings: wrappedSettings, drafts: base.storage.drafts },
      browser: base.browser,
      identity: base.identity,
      chatRequests,
      releaseFirstStream: () => release?.(),
    };
  };

  it("sends immediately without queueing when the runtime is idle", async () => {
    const fixture = createStreamingOptions();
    const runtime = createChatRuntime(fixture);
    runtime.start();

    runtime.actions.sendMessage({ text: "Straight through" });

    await vi.waitFor(() => {
      expect(runtime.getState().activeThread.messages.length).toBe(2);
    });
    expect(runtime.getState().queuedFollowUps).toHaveLength(0);
    runtime.dispose();
  });

  it("auto-drains a follow-up queued during an active stream once it completes", async () => {
    const fixture = createStreamingOptions();
    const gate = new Promise<void>((resolve) => {
      fixture.releaseFirstStream = resolve;
    });
    const baseFetch = fixture.transport.fetch;
    let firstHeld = true;
    fixture.transport.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await baseFetch(input, init);
      void firstHeld;
      return response;
    };
    // hold the first stream open until released
    let releaseHeld!: (value: Response) => void;
    const held = new Promise<Response>((resolve) => {
      releaseHeld = resolve;
    });
    let callCount = 0;
    fixture.transport.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (init?.method === "POST") {
        callCount += 1;
        if (callCount === 1) {
          await held;
          return streamResponse("first reply");
        }
        return streamResponse("queued reply");
      }
      return baseFetch(input, init);
    };
    void gate;

    const runtime = createChatRuntime(fixture);
    runtime.start();

    runtime.actions.sendMessage({ text: "First" });
    await vi.waitFor(() => expect(runtime.getState().activeThread.isStreaming).toBe(true));

    runtime.actions.sendMessage({ text: "Queued while streaming" });
    expect(runtime.getState().queuedFollowUps).toHaveLength(1);

    releaseHeld(new Response(null));
    await vi.waitFor(() => {
      expect(runtime.getState().queuedFollowUps).toHaveLength(0);
    });
    runtime.dispose();
  });

  it("Send now on a queued item sends it even when nothing is streaming", async () => {
    const adapter: ChatQueueSyncAdapter = {
      tabId: "tab-main",
      read: () => null,
      write: () => undefined,
      subscribe: (_sessionId, listener) => {
        void listener;
        return () => undefined;
      },
      broadcast: () => undefined,
    };
    const fixture = createStreamingOptions();
    let chatPosts = 0;
    const baseFetch = fixture.transport.fetch;
    fixture.transport.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (init?.method === "POST") {
        chatPosts += 1;
        return streamResponse("queued reply");
      }
      return baseFetch(input, init);
    };

    const runtime = createChatRuntime({ ...fixture, queueSync: { adapter } });
    runtime.start();

    runtime.actions.replaceQueuedFollowUps({
      items: [{ id: "queued-1", text: "Stuck message", attachments: [] }],
    });
    expect(runtime.getState().queuedFollowUps).toHaveLength(1);

    runtime.actions.forceSendQueuedFollowUp({ id: "queued-1" });

    await vi.waitFor(() => {
      expect(runtime.getState().queuedFollowUps).toHaveLength(0);
    });
    await vi.waitFor(() => {
      expect(chatPosts).toBe(1);
    });
    await vi.waitFor(() => {
      const serialized = JSON.stringify(runtime.getState().activeThread.messages);
      expect(serialized).toContain("queued reply");
    });
    runtime.dispose();
  });

  it("Cancel removes a queued item and it stays removed after the queue re-syncs", async () => {
    const store = new Map<string, ChatQueueSyncPayload>();
    const adapter: ChatQueueSyncAdapter = {
      tabId: "tab-main",
      read: (sessionId) => store.get(sessionId) ?? null,
      write: (payload) => {
        store.set(payload.sessionId, payload);
      },
      subscribe: (_sessionId, listener) => {
        void listener;
        return () => undefined;
      },
      broadcast: () => undefined,
    };
    const fixture = createStreamingOptions();
    let releaseHeld!: (value: Response) => void;
    const held = new Promise<Response>((resolve) => {
      releaseHeld = resolve;
    });
    let callCount = 0;
    const baseFetch = fixture.transport.fetch;
    fixture.transport.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (init?.method === "POST") {
        callCount += 1;
        if (callCount === 1) {
          await held;
          return streamResponse("first reply");
        }
        return streamResponse("queued reply");
      }
      return baseFetch(input, init);
    };

    const runtime = createChatRuntime({ ...fixture, queueSync: { adapter } });
    runtime.start();

    runtime.actions.sendMessage({ text: "First" });
    await vi.waitFor(() => expect(runtime.getState().activeThread.isStreaming).toBe(true));
    runtime.actions.sendMessage({ text: "Cancel me" });
    const queuedId = runtime.getState().queuedFollowUps[0]?.id ?? "";
    expect(queuedId).not.toBe("");

    runtime.actions.removeQueuedFollowUp({ id: queuedId });
    expect(runtime.getState().queuedFollowUps).toHaveLength(0);

    releaseHeld(new Response(null));
    await vi.waitFor(() => expect(runtime.getState().activeThread.isStreaming).toBe(false));

    runtime.actions.syncRoute({
      historyReady: true,
      sessionId: undefined,
      threadId: undefined,
      temporary: false,
    });

    expect(
      runtime.getState().queuedFollowUps.some((item) => item.id === queuedId),
    ).toBe(false);
    runtime.dispose();
  });
});
