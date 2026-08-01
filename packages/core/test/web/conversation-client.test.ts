import { describe, expect, it } from "vitest";

import { createConversationClient } from "../../src/web/chat-runtime/conversation-client.ts";

const createClient = ({ response }: { response: Response }) =>
  createConversationClient({
    apiOrigin: "https://chat.example/",
    fetch: async () => response,
  });

describe("conversation client response boundaries", () => {
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
