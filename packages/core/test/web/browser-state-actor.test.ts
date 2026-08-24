import { createActor } from "xstate";
import { describe, expect, it, vi } from "vitest";

import type { ChatSessionEvent } from "../../src/web/chat-session-machine.ts";
import { browserStateActor } from "../../src/web/chat-runtime/browser-state-actor.ts";

describe("browserStateActor", () => {
  it("restores a saved draft and reacts to online state changes", async () => {
    let listener: ((online: boolean) => void) | undefined;
    const sessionEvents: ChatSessionEvent[] = [];
    const actor = createActor(browserStateActor, {
      input: {
        draftStorageKey: "draft",
        sendSession: (event) => sessionEvents.push(event),
        browser: {
          online: () => true,
          subscribeOnline: (nextListener) => {
            listener = nextListener;
            return () => undefined;
          },
          storage: {
            getItem: () => "Saved draft",
            setItem: () => undefined,
            removeItem: () => undefined,
          },
        },
      },
    }).start();
    actor.send({
      type: "route-sync-requested",
      route: {
        historyReady: true,
        sessionId: "conversation-1",
        threadId: undefined,
        temporary: false,
      },
    });

    await vi.waitFor(() => expect(actor.getSnapshot().context.draftHydrated).toBe(true));
    expect(sessionEvents).toContainEqual({ type: "draft-changed", draft: "Saved draft" });

    listener?.(false);
    expect(actor.getSnapshot().context.online).toBe(false);
    actor.stop();
  });

  it("persists and clears drafts through the injected browser adapter", () => {
    const writes: string[] = [];
    const actor = createActor(browserStateActor, {
      input: {
        draftStorageKey: "draft",
        sendSession: () => undefined,
        browser: {
          online: () => true,
          subscribeOnline: () => () => undefined,
          storage: {
            getItem: () => null,
            setItem: (_, value) => writes.push(value),
            removeItem: () => writes.push("removed"),
          },
        },
      },
    }).start();

    actor.send({ type: "draft-persist-requested", draft: "Keep this" });
    actor.send({ type: "draft-persist-requested", draft: "" });

    expect(writes).toEqual(["Keep this", "removed"]);
    actor.stop();
  });

  it("hydrates the draft once on the first route sync", async () => {
    const sessionEvents: ChatSessionEvent[] = [];
    const actor = createActor(browserStateActor, {
      input: {
        draftStorageKey: "draft",
        sendSession: (event) => sessionEvents.push(event),
        browser: {
          online: () => true,
          subscribeOnline: () => () => undefined,
          storage: {
            getItem: () => "Saved draft",
            setItem: () => undefined,
            removeItem: () => undefined,
          },
        },
      },
    }).start();

    actor.send({
      type: "route-sync-requested",
      route: {
        historyReady: true,
        sessionId: "conversation-1",
        threadId: undefined,
        temporary: false,
      },
    });
    await vi.waitFor(() => expect(actor.getSnapshot().context.draftHydrated).toBe(true));

    actor.send({
      type: "route-sync-requested",
      route: {
        historyReady: true,
        sessionId: "conversation-2",
        threadId: undefined,
        temporary: false,
      },
    });

    await vi.waitFor(() => {
      expect(sessionEvents.filter((event) => event.type === "draft-changed")).toHaveLength(1);
    });
    actor.stop();
  });

  it("reports draft persistence failures through actor state", async () => {
    const actor = createActor(browserStateActor, {
      input: {
        draftStorageKey: "draft",
        sendSession: () => undefined,
        browser: {
          online: () => true,
          subscribeOnline: () => () => undefined,
          storage: {
            getItem: () => null,
            setItem: () => {
              throw new Error("Quota exceeded.");
            },
            removeItem: () => undefined,
          },
        },
      },
    }).start();

    actor.send({ type: "draft-persist-requested", draft: "Keep this" });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().context.error).toBe("Quota exceeded.");
    });
    actor.stop();
  });
});

describe("browserStateActor cross-tab draft sync regressions", () => {
  type StorageChangeListener = (event: { key: string | null; newValue: string | null }) => void;

  const createSyncFixture = () => {
    const store = new Map<string, string>([["draft", "Ghost draft"]]);
    const listeners = new Set<StorageChangeListener>();
    const writes: Array<{ op: "set" | "remove"; value?: string }> = [];
    let sessionEvents: ChatSessionEvent[] = [];
    const actor = createActor(browserStateActor, {
      input: {
        draftStorageKey: "draft",
        sendSession: (event) => sessionEvents.push(event),
        browser: {
          online: () => true,
          subscribeOnline: () => () => undefined,
          subscribeStorage: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          storage: {
            getItem: (key) => store.get(key) ?? null,
            setItem: (key, value) => {
              store.set(key, value);
              writes.push({ op: "set", value });
              for (const listener of listeners) listener({ key, newValue: value });
            },
            removeItem: (key) => {
              store.delete(key);
              writes.push({ op: "remove" });
              for (const listener of listeners) listener({ key, newValue: null });
            },
          },
        },
      },
    }).start();
    return {
      actor,
      writes: () => writes,
      events: () => sessionEvents,
      remoteSet: (value: string | null) => {
        if (value === null) store.delete("draft");
        else store.set("draft", value);
        for (const listener of listeners) listener({ key: "draft", newValue: value });
      },
    };
  };

  const syncRoute = (actor: ReturnType<typeof createActor<never>>) =>
    actor.send({
      type: "route-sync-requested",
      route: { historyReady: true, sessionId: "c1", threadId: undefined, temporary: false },
    });

  it("clears the local composer when another tab removes the saved draft", async () => {
    const fixture = createSyncFixture();
    syncRoute(fixture.actor as never);
    await vi.waitFor(() => expect(fixture.actor.getSnapshot().context.draftHydrated).toBe(true));
    expect(fixture.events()).toContainEqual({ type: "draft-changed", draft: "Ghost draft" });

    fixture.remoteSet(null);

    await vi.waitFor(() => {
      expect(fixture.events().at(-1)).toEqual({ type: "draft-changed", draft: "" });
    });
    fixture.actor.stop();
  });

  it("adopts a draft typed in another tab without echoing writes back", async () => {
    const fixture = createSyncFixture();
    syncRoute(fixture.actor as never);
    await vi.waitFor(() => expect(fixture.actor.getSnapshot().context.draftHydrated).toBe(true));

    fixture.writes().length = 0;
    fixture.remoteSet("Typed elsewhere");

    await vi.waitFor(() => {
      expect(fixture.events().at(-1)).toEqual({ type: "draft-changed", draft: "Typed elsewhere" });
    });
    expect(fixture.writes()).toEqual([]);
    fixture.actor.stop();
  });

  it("does not persist-loop when the restored remote draft matches the last persisted value", async () => {
    const fixture = createSyncFixture();
    syncRoute(fixture.actor as never);
    await vi.waitFor(() => expect(fixture.actor.getSnapshot().context.draftHydrated).toBe(true));

    fixture.actor.send({ type: "draft-persist-requested", draft: "Same text" });
    const writesAfterFirst = fixture.writes().length;
    fixture.actor.send({ type: "draft-persist-requested", draft: "Same text" });

    expect(fixture.writes().length).toBe(writesAfterFirst);
    fixture.actor.stop();
  });

  it("ignores a stale asynchronous hydration once a newer draft was persisted", async () => {
    let releaseHydration!: (value: string | null) => void;
    const hydrationGate = new Promise<string | null>((resolve) => {
      releaseHydration = resolve;
    });
    const sessionEvents: ChatSessionEvent[] = [];
    const actor = createActor(browserStateActor, {
      input: {
        draftStorageKey: "draft",
        sendSession: (event) => sessionEvents.push(event),
        browser: {
          online: () => true,
          subscribeOnline: () => () => undefined,
          storage: {
            getItem: () => hydrationGate,
            setItem: () => undefined,
            removeItem: () => undefined,
          },
        },
      },
    }).start();

    actor.send({
      type: "route-sync-requested",
      route: { historyReady: true, sessionId: "c1", threadId: undefined, temporary: false },
    });
    actor.send({ type: "draft-persist-requested", draft: "" });
    releaseHydration("Stale pre-send draft");

    await vi.waitFor(() => expect(actor.getSnapshot().context.draftHydrated).toBe(true));
    expect(sessionEvents).not.toContainEqual({
      type: "draft-changed",
      draft: "Stale pre-send draft",
    });
    actor.stop();
  });
});
