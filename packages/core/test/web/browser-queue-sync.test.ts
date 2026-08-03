import { describe, expect, it } from "vitest";

import {
  FOLLOW_UP_QUEUE_STORAGE_MAX_CHARS,
  createBrowserFollowUpQueueSyncAdapter,
  followUpQueueStorageKey,
  parseFollowUpQueueSyncJson,
  serializeFollowUpQueue,
  stripHeavyQueueAttachments,
  writeStoredFollowUpQueue,
} from "../../src/web/chat-runtime/browser-queue-sync.ts";
import type { ChatQueueSyncMessage } from "../../src/runtime/types.ts";

const item = (id: string, url = `data:text/plain,${id}`) => ({
  id,
  text: id,
  attachments: [
    {
      id: `attachment:${id}`,
      name: "file.txt",
      mediaType: "text/plain",
      url,
    },
  ],
});

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    values,
  };
};

describe("browser follow-up queue sync", () => {
  it("round-trips a typed queue payload through JSON", () => {
    const payload = {
      type: "queue.sync" as const,
      sessionId: "conversation-1",
      tabId: "tab-a",
      revision: 3,
      items: [item("queued-1")],
    };

    expect(parseFollowUpQueueSyncJson(serializeFollowUpQueue(payload))).toEqual(payload);
  });

  it("drops oversized attachment data while keeping the queue item", () => {
    const payload = {
      type: "queue.sync" as const,
      sessionId: "conversation-1",
      tabId: "tab-a",
      revision: 1,
      items: [item("queued-1", `data:text/plain,${"A".repeat(FOLLOW_UP_QUEUE_STORAGE_MAX_CHARS)}`)],
    };

    expect(stripHeavyQueueAttachments(payload.items)).toEqual([
      { id: "queued-1", text: "queued-1", attachments: [] },
    ]);
    expect(serializeFollowUpQueue(payload).length).toBeLessThan(FOLLOW_UP_QUEUE_STORAGE_MAX_CHARS);
  });

  it("persists and removes a queue through the injected storage boundary", () => {
    const { storage, values } = createStorage();
    const payload = {
      type: "queue.sync" as const,
      sessionId: "conversation-1",
      tabId: "tab-a",
      revision: 2,
      items: [item("queued-1")],
    };

    writeStoredFollowUpQueue({ payload, storage });
    expect(values.has(followUpQueueStorageKey("conversation-1"))).toBe(true);
    writeStoredFollowUpQueue({ payload: { ...payload, items: [] }, storage });
    expect(values.has(followUpQueueStorageKey("conversation-1"))).toBe(false);
  });

  it("hydrates, broadcasts, and unsubscribes through injected browser primitives", () => {
    const { storage } = createStorage();
    const messages: ChatQueueSyncMessage[] = [];
    const storageListeners: Array<
      (event: { key: string | null; newValue: string | null }) => void
    > = [];
    const channels: Array<{ messages: unknown[]; closed: boolean }> = [];
    const adapter = createBrowserFollowUpQueueSyncAdapter({
      storage,
      createId: () => "tab-a",
      subscribeStorage: (listener) => {
        storageListeners.push(listener);
        return () => storageListeners.splice(storageListeners.indexOf(listener), 1);
      },
      createChannel: () => {
        const state: { messages: unknown[]; closed: boolean } = { messages: [], closed: false };
        channels.push(state);
        return {
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          postMessage: (message) => state.messages.push(message),
          close: () => {
            state.closed = true;
          },
        };
      },
    });

    const unsubscribe = adapter.subscribe("conversation-1", (message) => messages.push(message));
    const payload = {
      type: "queue.sync" as const,
      sessionId: "conversation-1",
      tabId: "tab-b",
      revision: 4,
      items: [item("queued-1")],
    };
    storage.setItem(followUpQueueStorageKey("conversation-1"), serializeFollowUpQueue(payload));
    storageListeners[0]?.({
      key: followUpQueueStorageKey("conversation-1"),
      newValue: valuesFor(storage, "conversation-1"),
    });
    adapter.broadcast(payload);
    unsubscribe();

    expect(messages).toEqual([payload]);
    expect(channels.every((channel) => channel.closed)).toBe(true);
  });
});

const valuesFor = (storage: { getItem: (key: string) => string | null }, sessionId: string) =>
  storage.getItem(followUpQueueStorageKey(sessionId));
