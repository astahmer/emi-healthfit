import { describe, expect, it, vi } from "vitest";
import { createWindowFollowUpQueueSyncAdapter } from "../../src/web/chat-runtime/browser-queue-sync.ts";
import type { ChatQueueSyncMessage } from "../../src/runtime/types.ts";

const fakeStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
};

describe("createWindowFollowUpQueueSyncAdapter", () => {
  it("binds storage events and broadcast channels from the injected window", async () => {
    const storageListeners = new Set<
      (event: { key: string | null; newValue: string | null }) => void
    >();
    const windowLike = {
      localStorage: fakeStorage(),
      addEventListener: (
        type: "storage",
        listener: (event: { key: string | null; newValue: string | null }) => void,
      ) => {
        if (type === "storage") storageListeners.add(listener);
      },
      removeEventListener: (
        type: "storage",
        listener: (event: { key: string | null; newValue: string | null }) => void,
      ) => {
        storageListeners.delete(listener);
      },
    };
    const channelListeners = new Set<(event: { data: unknown }) => void>();
    const BroadcastChannel = class {
      constructor(public name: string) {}
      addEventListener = (_type: string, listener: (event: { data: unknown }) => void) => {
        channelListeners.add(listener);
      };
      removeEventListener = (_type: string, listener: (event: { data: unknown }) => void) => {
        channelListeners.delete(listener);
      };
      postMessage = (data: unknown) => {
        for (const listener of channelListeners) listener({ data });
      };
      close() {}
    };

    const adapter = createWindowFollowUpQueueSyncAdapter({
      target: windowLike as never,
      BroadcastChannel: BroadcastChannel as never,
      createTabId: () => "tab-1",
    });

    expect(adapter.tabId).toBe("tab-1");

    const listener = vi.fn();
    adapter.subscribe("session-1", listener);

    const payload: ChatQueueSyncMessage = {
      type: "queue.sync",
      sessionId: "session-1",
      tabId: "tab-2",
      revision: 1,
      items: [],
    };
    for (const notify of channelListeners) notify({ data: payload });

    await vi.waitFor(() =>
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ tabId: "tab-2" })),
    );

    expect(storageListeners.size).toBe(1);
    expect(channelListeners.size).toBeGreaterThan(0);
  });

  it("reads and writes queued follow-ups through the injected local storage", () => {
    const storage = fakeStorage();
    const adapter = createWindowFollowUpQueueSyncAdapter({
      target: {
        localStorage: storage,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
      createTabId: () => "tab-1",
    });

    adapter.write({
      type: "queue.sync",
      sessionId: "session-1",
      tabId: "tab-1",
      revision: 3,
      items: [{ id: "item-1", text: "hello", attachments: [] }],
    });

    const read = adapter.read("session-1");
    expect(read).not.toBeNull();
    expect(read?.revision).toBe(3);
  });
});
