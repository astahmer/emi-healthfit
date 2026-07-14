import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "./sessions";
import {
  deleteCachedThread,
  getCachedConversationSnapshot,
  getCachedThreads,
  setCachedConversationSnapshot,
  setCachedThreads,
} from "./session-cache";

const thread: Thread = {
  id: "conversation-1",
  title: "Cached workout",
  status: "regular",
  created_at: "2026-07-15T00:00:00.000Z",
  updated_at: "2026-07-15T01:00:00.000Z",
};

describe("session cache", () => {
  beforeEach(async () => {
    await Dexie.delete("EmiSessions");
  });

  it("reads conversation metadata without a network request", async () => {
    await setCachedThreads([thread]);
    await expect(getCachedThreads()).resolves.toEqual([thread]);
  });

  it("stores full validated conversation payloads and removes them with the conversation", async () => {
    const data = { conversation: thread, messages: [], threads: [] };
    await setCachedThreads([thread]);
    await setCachedConversationSnapshot({ conversationId: thread.id, data });

    await expect(getCachedConversationSnapshot(thread.id)).resolves.toEqual(data);
    await deleteCachedThread(thread.id);
    await expect(getCachedConversationSnapshot(thread.id)).resolves.toBeUndefined();
  });
});
