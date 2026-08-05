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
