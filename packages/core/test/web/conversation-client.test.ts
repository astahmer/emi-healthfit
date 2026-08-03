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
});
