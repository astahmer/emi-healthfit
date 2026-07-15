import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "./sessions";

const cache = vi.hoisted(() => ({
  deleteCachedThread: vi.fn(),
  getCachedMessages: vi.fn(),
  getCachedThreads: vi.fn(),
  mergeCachedThreads: vi.fn(),
  setCachedConversation: vi.fn(),
  setCachedThreads: vi.fn(),
  updateCachedThread: vi.fn(),
}));

vi.mock("./session-cache", () => cache);

import { fetchConversationMessages, syncConversations } from "./sessions";

const thread: Thread = {
  id: "conversation-1",
  title: "Cached workout",
  status: "regular",
  pinned: false,
  created_at: "2026-07-14T10:00:00.000Z",
  updated_at: "2026-07-14T11:00:00.000Z",
};

describe("offline session browsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  });

  it("loads the cached conversation list when the network is unavailable", async () => {
    cache.getCachedThreads.mockResolvedValue([thread]);

    await expect(syncConversations()).resolves.toEqual([thread]);
    expect(cache.getCachedThreads).toHaveBeenCalledWith(undefined);
  });

  it("opens an empty cached conversation when the network is unavailable", async () => {
    cache.getCachedMessages.mockResolvedValue([]);
    cache.getCachedThreads.mockResolvedValue([thread]);

    await expect(fetchConversationMessages(thread.id)).resolves.toEqual({
      thread,
      messages: [],
    });
  });

  it("merges search results without replacing the complete cache", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ conversations: [thread] }), { status: 200 }),
    );

    await expect(syncConversations("workout")).resolves.toEqual([thread]);
    expect(cache.mergeCachedThreads).toHaveBeenCalledWith([thread]);
    expect(cache.setCachedThreads).not.toHaveBeenCalled();
  });
});
