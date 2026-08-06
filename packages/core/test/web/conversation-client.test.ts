import { describe, expect, it } from "vitest";

import { createConversationClient } from "../../src/web/chat-runtime/conversation-client.ts";

const createClient = ({ response }: { response: Response }) =>
  createConversationClient({
    apiOrigin: "https://chat.example/",
    fetch: async () => response,
  });

describe("conversation client response boundaries", () => {
  it("persists a revised message through the conversation contract", async () => {
    let requestBody: unknown;
    const client = createConversationClient({
      apiOrigin: "https://chat.example/",
      fetch: async (input, init) => {
        expect(String(input)).toBe(
          "https://chat.example/api/conversations/conversation-1/messages/message-1",
        );
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      },
    });

    await client.reviseConversationMessage({
      conversationId: "conversation-1",
      messageId: "message-1",
      parts: [{ type: "text", text: "Revised" }],
      threadId: "thread-1",
    });

    expect(requestBody).toEqual({
      parts: [{ type: "text", text: "Revised" }],
      threadId: "thread-1",
    });
  });

  it("encodes dynamic resource identifiers in request paths", async () => {
    let requestUrl = "";
    const client = createConversationClient({
      apiOrigin: "https://chat.example/",
      fetch: async (input) => {
        requestUrl = String(input);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      },
    });

    await client.reviseConversationMessage({
      conversationId: "conversation/1",
      messageId: "message 1",
      parts: [{ type: "text", text: "Revised" }],
    });

    expect(requestUrl).toBe(
      "https://chat.example/api/conversations/conversation%2F1/messages/message%201",
    );
  });

  it("decodes provider-neutral suggestions from the suggestions endpoint", async () => {
    const client = createConversationClient({
      apiOrigin: "https://chat.example/",
      fetch: async (input) => {
        expect(String(input)).toContain("/api/suggestions");
        return new Response(JSON.stringify({ suggestions: ["Tell me more"] }), {
          headers: { "content-type": "application/json" },
        });
      },
    });

    await expect(
      client.generateSuggestions({
        lastAssistantText: "Hello",
        config: { provider: "openai", apiKey: "key", model: "test-model" },
      }),
    ).resolves.toEqual(["Tell me more"]);
  });

  it("rejects an HTML SPA fallback with a proxy-specific error", async () => {
    const client = createClient({
      response: new Response("<!doctype html><html></html>", {
        headers: { "content-type": "text/html" },
      }),
    });

    await expect(client.listConversations({ search: "" })).rejects.toThrow(
      "API endpoint returned HTML instead of JSON",
    );
  });

  it("rejects unexpected response content types before decoding them", async () => {
    const client = createClient({
      response: new Response("service unavailable", {
        status: 503,
        headers: { "content-type": "text/plain" },
      }),
    });

    await expect(client.listConversations({ search: "" })).rejects.toThrow(
      "unexpected content type text/plain",
    );
  });

  it("preserves structured API errors", async () => {
    const client = createClient({
      response: new Response(JSON.stringify({ error: "Anonymous session unavailable." }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    });

    await expect(client.listConversations({ search: "" })).rejects.toThrow(
      "Anonymous session unavailable.",
    );
  });

  it("collapses compacted conversation history into summary plus newer rows", async () => {
    const client = createClient({
      response: new Response(
        JSON.stringify({
          conversation: {
            id: "conversation-1",
            title: null,
            status: "regular",
            pinned: false,
            createdAt: "2026-07-14T10:00:00.000Z",
            updatedAt: "2026-07-14T10:00:00.000Z",
          },
          messages: [
            {
              id: "old-user",
              parentId: null,
              role: "user",
              parts: JSON.stringify([{ type: "text", text: "Old question" }]),
              model: null,
              createdAt: "2026-07-14T10:00:00.000Z",
            },
            {
              id: "old-assistant",
              parentId: null,
              role: "assistant",
              parts: JSON.stringify([{ type: "text", text: "Old answer" }]),
              model: null,
              createdAt: "2026-07-14T10:01:00.000Z",
            },
            {
              id: "summary-1",
              parentId: null,
              role: "summary",
              parts: JSON.stringify([{ type: "text", text: "Compacted notes" }]),
              model: null,
              createdAt: "2026-07-20T00:00:00.000Z",
            },
            {
              id: "new-user",
              parentId: null,
              role: "user",
              parts: JSON.stringify([{ type: "text", text: "Follow up" }]),
              model: null,
              createdAt: "2026-07-20T00:01:00.000Z",
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    });

    const loaded = await client.loadConversation({ conversationId: "conversation-1" });
    expect(loaded.messages.map((message) => message.id)).toEqual(["summary-1", "new-user"]);
  });

  it("keeps branch rows and the summary when loading a thread detail", async () => {
    const client = createClient({
      response: new Response(
        JSON.stringify({
          thread: {
            id: "thread-1",
            conversationId: "conversation-1",
            anchorMessageId: "anchor",
            title: "Branch",
            status: "regular",
            pinned: false,
            createdAt: "2026-07-14T10:00:00.000Z",
            updatedAt: "2026-07-14T10:00:00.000Z",
          },
          messages: [
            {
              id: "anchor",
              parentId: null,
              role: "user",
              parts: JSON.stringify([{ type: "text", text: "Root question" }]),
              model: null,
              createdAt: "2026-07-14T10:00:00.000Z",
            },
            {
              id: "branch-1",
              parentId: "anchor",
              role: "assistant",
              parts: JSON.stringify([{ type: "text", text: "Branch answer" }]),
              model: null,
              createdAt: "2026-07-14T10:05:00.000Z",
            },
            {
              id: "summary-1",
              parentId: "branch-1",
              role: "summary",
              parts: JSON.stringify([{ type: "text", text: "Compacted notes" }]),
              model: null,
              createdAt: "2026-07-20T00:00:00.000Z",
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    });

    const loaded = await client.loadThread({
      conversationId: "conversation-1",
      threadId: "thread-1",
    });
    expect(loaded.messages.map((message) => message.id)).toEqual(["summary-1", "branch-1"]);
  });
});
