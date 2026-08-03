import { describe, expect, it } from "vitest";
import { createActor } from "xstate";

import type {
  ChatQueueSyncAdapter,
  ChatQueueSyncMessage,
  ChatQueueSyncPayload,
} from "../../src/runtime/types.ts";
import { followUpQueueActor } from "../../src/web/chat-runtime/follow-up-queue-actor.ts";

const tick = async () => new Promise<void>((resolve) => setImmediate(resolve));

const route = {
  historyReady: true,
  sessionId: "conversation-1",
  threadId: undefined,
  temporary: false,
} as const;

const item = (id: string) => ({
  id,
  text: id,
  attachments: [
    {
      id: `attachment:${id}`,
      name: "file.txt",
      mediaType: "text/plain",
      url: `data:text/plain,${id}`,
    },
  ],
});

const createAdapter = () => {
  let stored: ChatQueueSyncPayload | null = null;
  let listener: ((message: ChatQueueSyncMessage) => void) | undefined;
  const writes: ChatQueueSyncPayload[] = [];
  const broadcasts: ChatQueueSyncMessage[] = [];
  const adapter: ChatQueueSyncAdapter = {
    tabId: "tab-a",
    read: () => stored,
    write: (payload) => {
      stored = payload;
      writes.push(payload);
    },
    subscribe: (_sessionId, next) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
    broadcast: (message) => broadcasts.push(message),
  };
  return {
    adapter,
    writes,
    broadcasts,
    setStored: (payload: ChatQueueSyncPayload | null) => {
      stored = payload;
    },
    receive: (message: ChatQueueSyncMessage) => listener?.(message),
  };
};

describe("follow-up queue actor", () => {
  it("hydrates and persists queued follow-ups through the adapter", async () => {
    const adapter = createAdapter();
    adapter.setStored({
      type: "queue.sync",
      sessionId: "conversation-1",
      tabId: "tab-b",
      revision: 4,
      items: [item("stored")],
    });
    const sessionEvents: unknown[] = [];
    const actor = createActor(followUpQueueActor, {
      input: { adapter: adapter.adapter, sendSession: (event) => sessionEvents.push(event) },
    }).start();
    await tick();
    actor.send({ type: "route-sync-requested", route });
    await tick();
    actor.send({
      type: "session-event",
      event: {
        type: "follow-up-queued",
        followUp: { id: "local", text: "local", files: [] },
      },
    });
    await tick();

    expect(sessionEvents).toEqual([
      {
        type: "queued-follow-ups-replaced",
        items: [{ id: "stored", text: "stored", files: item("stored").attachments }],
      },
    ]);
    expect(adapter.writes).toHaveLength(1);
    expect(adapter.writes[0]?.items.map(({ id }) => id)).toEqual(["stored", "local"]);
    expect(adapter.broadcasts).toHaveLength(1);
    actor.stop();
  });

  it("forwards a remote force-send only while streaming", async () => {
    const adapter = createAdapter();
    const forceSendIds: string[] = [];
    const actor = createActor(followUpQueueActor, {
      input: {
        adapter: adapter.adapter,
        sendSession: () => undefined,
        onRemoteForceSend: ({ id }) => forceSendIds.push(id),
      },
    }).start();
    await tick();
    actor.send({ type: "route-sync-requested", route });
    await tick();
    adapter.receive({
      type: "queue.force-send",
      sessionId: "conversation-1",
      tabId: "tab-b",
      itemId: "queued-1",
    });
    actor.send({ type: "session-event", event: { type: "stream-started", messages: [] } });
    adapter.receive({
      type: "queue.force-send",
      sessionId: "conversation-1",
      tabId: "tab-b",
      itemId: "queued-2",
    });
    await tick();

    expect(forceSendIds).toEqual(["queued-2"]);
    actor.stop();
  });
});
