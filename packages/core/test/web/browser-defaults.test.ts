import { describe, expect, it, vi } from "vitest";
import { createBrowserChatDefaults } from "../../src/web/chat-runtime/browser-defaults.ts";

const fakeLocalStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
};

describe("createBrowserChatDefaults", () => {
  it("wires draft storage to injected localStorage", async () => {
    const draftsStorage = fakeLocalStorage();
    const defaults = createBrowserChatDefaults({
      draftsStorage,
      createId: () => "id-1",
      now: () => "2026-01-01T00:00:00.000Z",
    });

    await defaults.storage.drafts.set("draft-key", "hello");
    expect(draftsStorage.getItem("draft-key")).toBe("hello");
    await expect(defaults.storage.drafts.get("draft-key")).resolves.toBe("hello");

    await defaults.storage.drafts.remove("draft-key");
    await expect(defaults.storage.drafts.get("draft-key")).resolves.toBeNull();
  });

  it("falls back to a no-op draft store without a storage backend", async () => {
    const defaults = createBrowserChatDefaults({
      createId: () => "id-1",
      now: () => "2026-01-01T00:00:00.000Z",
    });

    await defaults.storage.drafts.set("k", "v");
    await expect(defaults.storage.drafts.get("k")).resolves.toBeNull();
    await defaults.storage.drafts.remove("k");
  });

  it("subscribes to online/offline events on the injected event target", () => {
    const listeners = new Map<string, Set<() => void>>();
    const navigatorRef = { onLine: true };
    const eventTarget = {
      addEventListener: (type: "online" | "offline", listener: () => void) => {
        listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
      },
      removeEventListener: (type: "online" | "offline", listener: () => void) => {
        listeners.get(type)?.delete(listener);
      },
    };
    const defaults = createBrowserChatDefaults({
      navigator: navigatorRef,
      eventTarget,
      createId: () => "id-1",
      now: () => "2026-01-01T00:00:00.000Z",
    });

    expect(defaults.browser.online).toBe(true);
    const listener = vi.fn();
    const unsubscribe = defaults.browser.subscribeOnline(listener);

    for (const notify of listeners.get("online") ?? []) notify();
    expect(listener).toHaveBeenCalledWith(true);

    navigatorRef.onLine = false;
    for (const notify of listeners.get("offline") ?? []) notify();
    expect(listener).toHaveBeenLastCalledWith(false);

    unsubscribe();
    expect((listeners.get("online") ?? new Set()).size).toBe(0);
    expect((listeners.get("offline") ?? new Set()).size).toBe(0);
  });

  it("treats missing browser capabilities as online with a no-op subscription", () => {
    const defaults = createBrowserChatDefaults({
      createId: () => "id-1",
      now: () => "2026-01-01T00:00:00.000Z",
    });
    expect(defaults.browser.online).toBe(true);
    expect(defaults.browser.subscribeOnline(() => undefined)).toBeTypeOf("function");
  });

  it("delegates identity to the injected clock and id generator", () => {
    let counter = 0;
    const defaults = createBrowserChatDefaults({
      createId: () => `uuid-${(counter += 1)}`,
      now: () => "2026-08-23T12:00:00.000Z",
    });

    expect(defaults.identity.createId()).toBe("uuid-1");
    expect(defaults.identity.createId()).toBe("uuid-2");
    expect(defaults.identity.now()).toBe("2026-08-23T12:00:00.000Z");
  });
});
