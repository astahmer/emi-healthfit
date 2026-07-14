import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchConversationMessages, forkThread } from "./conversations";

const rawThread = {
  id: "branch-1",
  conversation_id: "conversation-1",
  anchor_message_id: "message-1",
  title: "Alternative plan",
  status: "regular",
  pinned: false,
  message_ids: ["message-1"],
  created_at: "2026-07-14T10:00:00.000Z",
  updated_at: "2026-07-14T10:00:00.000Z",
};

describe("conversation API decoding", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("decodes persisted parent and thread relationships", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            conversation: {
              id: "conversation-1",
              title: "Workout",
              status: "regular",
              created_at: "2026-07-14T10:00:00.000Z",
              updated_at: "2026-07-14T10:00:00.000Z",
            },
            messages: [
              {
                id: "message-1",
                conversationId: "conversation-1",
                parentId: null,
                role: "user",
                parts: [{ type: "text", text: "Try another plan" }],
                createdAt: "2026-07-14T10:00:00.000Z",
              },
            ],
            threads: [rawThread],
          }),
        ),
      ),
    );

    const result = await fetchConversationMessages("conversation-1");
    expect(result.messages[0]?.parentId).toBeNull();
    expect(result.threads[0]).toMatchObject({
      conversationId: "conversation-1",
      anchorMessageId: "message-1",
      messageIds: ["message-1"],
    });
  });

  it("returns the complete branch created by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(rawThread), { status: 201 })),
    );

    await expect(forkThread("conversation-1", "message-1")).resolves.toMatchObject({
      id: "branch-1",
      anchorMessageId: "message-1",
    });
  });
});
