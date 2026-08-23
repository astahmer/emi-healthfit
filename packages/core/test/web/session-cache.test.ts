import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import type { SessionThread } from "../../src/web/session-cache.ts";
import {
  deleteCachedThread,
  getCachedConversationSnapshot,
  getCachedMessages,
  getCachedThreads,
  mergeCachedThreads,
  setCachedConversation,
  setCachedConversationSnapshot,
  setCachedThreads,
} from "../../src/web/session-cache.ts";

const thread: SessionThread = {
  id: "conversation-1",
  title: "Cached workout",
  status: "regular",
  pinned: false,
  created_at: "2026-07-15T00:00:00.000Z",
  updated_at: "2026-07-15T01:00:00.000Z",
};

describe("session cache", () => {
  beforeEach(async () => {
    await Dexie.delete("EmiSessions");
  });

  it("reads conversation metadata without a network request", async () => {
    expect(await getCachedThreads()).toEqual([]);

    await setCachedThreads([thread]);
    const cached = await getCachedThreads();
    expect(cached).toHaveLength(1);
    expect(cached[0]).toMatchObject({ id: thread.id, title: thread.title });
  });

  it("filters cached threads by search term", async () => {
    await setCachedThreads([
      thread,
      { ...thread, id: "conversation-2", title: "Sleep notes" },
    ]);
    expect((await getCachedThreads("sleep")).map((item) => item.id)).toEqual(["conversation-2"]);
    expect((await getCachedThreads("  "))).toHaveLength(2);
  });

  it("stores full validated conversation payloads and removes them with the conversation", async () => {
    await setCachedConversation({
      thread,
      messages: [
        { id: "message-1", role: "user", parts: [{ type: "text", text: "hello" }] },
      ] as never,
    });

    expect((await getCachedMessages(thread.id)).map((message) => message.id)).toEqual([
      "message-1",
    ]);
    await setCachedConversationSnapshot({ conversationId: thread.id, data: { ok: true } });
    expect(await getCachedConversationSnapshot(thread.id)).toEqual({ ok: true });

    await deleteCachedThread(thread.id);
    expect(await getCachedThreads()).toEqual([]);
    expect(await getCachedMessages(thread.id)).toEqual([]);
    expect(await getCachedConversationSnapshot(thread.id)).toBeUndefined();
  });

  it("merges cached threads without clearing existing rows", async () => {
    await setCachedThreads([thread]);
    await mergeCachedThreads([{ ...thread, id: "conversation-3", title: "New" }]);
    expect((await getCachedThreads()).map((item) => item.id).sort()).toEqual([
      "conversation-1",
      "conversation-3",
    ]);
  });
});
