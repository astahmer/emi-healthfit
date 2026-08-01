import { createServer, type Server } from "node:http";
import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import { createConversationClient } from "@emi/core/web";

const apiOrigin = process.env.GENERIC_API_ORIGIN ?? "http://localhost:3233";
const expectedWorkerName = process.env.GENERIC_EXPECTED_APP_NAME ?? "Core Chat";

const providerChunk = ({ content, finishReason }: { content?: string; finishReason?: string }) =>
  JSON.stringify({
    id: "generic-provider-test",
    object: "chat.completion.chunk",
    created: 1,
    model: "test-model",
    choices: [
      {
        index: 0,
        delta: content === undefined ? {} : { content, role: "assistant" },
        finish_reason: finishReason ?? null,
      },
    ],
  });

const startProvider = async (): Promise<{ baseUrl: string; server: Server }> => {
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      "content-type": "text/event-stream",
    });
    response.end(
      [
        `data: ${providerChunk({ content: "generic provider reply" })}`,
        `data: ${providerChunk({ finishReason: "stop" })}`,
        `data: ${JSON.stringify({
          id: "generic-provider-usage",
          object: "chat.completion.chunk",
          created: 1,
          model: "test-model",
          choices: [],
          usage: { prompt_tokens: 1, completion_tokens: 3, total_tokens: 4 },
        })}`,
        "data: [DONE]",
        "",
      ].join("\n\n"),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("Generic provider test server did not receive an address");
  }
  return { baseUrl: `http://127.0.0.1:${address.port}/v1`, server };
};

const hasPersistedProviderReply = async ({
  apiOrigin,
  cookie,
  conversationId,
  attempts,
}: {
  apiOrigin: string;
  cookie: string;
  conversationId: string;
  attempts: number;
}): Promise<boolean> => {
  const persistedResponse = await fetch(`${apiOrigin}/api/conversations/${conversationId}`, {
    headers: { cookie },
  });
  if (persistedResponse.ok) {
    const persisted = Schema.decodeUnknownSync(
      Schema.Struct({
        messages: Schema.Array(Schema.Struct({ role: Schema.String, parts: Schema.String })),
      }),
    )(await persistedResponse.json());
    if (persisted.messages.some((message) => message.parts.includes("generic provider reply")))
      return true;
  }
  if (attempts <= 1) return false;
  await new Promise((resolve) => setTimeout(resolve, 50));
  return hasPersistedProviderReply({ apiOrigin, attempts: attempts - 1, conversationId, cookie });
};

describe("generic web and worker local API topology", () => {
  it("fetches health and structured conversation auth errors through the Vite path", async () => {
    const healthResponse = await fetch(`${apiOrigin}/api/health`);
    expect(healthResponse.headers.get("content-type")).toContain("application/json");
    expect(await healthResponse.json()).toEqual({ name: expectedWorkerName });

    const client = createConversationClient({ apiOrigin, fetch });
    await expect(client.listConversations({ search: "" })).rejects.toThrow(
      "Authentication required",
    );
  });

  it("creates an anonymous session and exercises generic Worker persistence routes", async () => {
    const authOrigin = process.env.GENERIC_AUTH_ORIGIN ?? apiOrigin;
    const rejectedAuthResponse = await fetch(`${apiOrigin}/api/auth/sign-in/anonymous`, {
      headers: { origin: `${apiOrigin}/wrong-origin` },
      method: "POST",
    });
    expect(rejectedAuthResponse.status).toBe(403);
    expect(await rejectedAuthResponse.json()).toEqual({ error: "Invalid origin" });

    const authResponse = await fetch(`${apiOrigin}/api/auth/sign-in/anonymous`, {
      headers: { origin: authOrigin },
      method: "POST",
    });
    expect(authResponse.status).toBe(201);
    const setCookie = authResponse.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    const cookie = setCookie?.split(";", 1)[0];
    expect(cookie).toBeTruthy();

    const authenticated = (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set("cookie", cookie ?? "");
      return fetch(`${apiOrigin}${path}`, { ...init, headers });
    };

    const conversationsResponse = await authenticated("/api/conversations");
    expect(conversationsResponse.status).toBe(200);
    expect(await conversationsResponse.json()).toEqual({ conversations: [] });

    const createdResponse = await authenticated("/api/conversations", { method: "POST" });
    expect(createdResponse.status).toBe(201);
    const created = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(
      await createdResponse.json(),
    );
    expect(created.id).toBeTruthy();

    const updatedResponse = await authenticated(`/api/conversations/${created.id}`, {
      body: JSON.stringify({ pinned: true, status: "archived", title: "Worker lifecycle" }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    expect(updatedResponse.status).toBe(200);
    const updated = Schema.decodeUnknownSync(
      Schema.Struct({
        conversation: Schema.Struct({
          pinned: Schema.Boolean,
          status: Schema.Literals(["regular", "archived"]),
          title: Schema.NullOr(Schema.String),
        }),
      }),
    )(await updatedResponse.json());
    expect(updated.conversation).toEqual({
      pinned: true,
      status: "archived",
      title: "Worker lifecycle",
    });

    const invalidUpdateResponse = await authenticated(`/api/conversations/${created.id}`, {
      body: JSON.stringify({ pinned: "yes" }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    expect(invalidUpdateResponse.status).toBe(400);
    expect(await invalidUpdateResponse.json()).toEqual({ error: "Invalid conversation update" });

    const searchResponse = await authenticated("/api/conversations?search=lifecycle");
    const searched = Schema.decodeUnknownSync(
      Schema.Struct({
        conversations: Schema.Array(Schema.Struct({ id: Schema.String })),
      }),
    )(await searchResponse.json());
    expect(searched.conversations.map((conversation) => conversation.id)).toContain(created.id);

    const threadsResponse = await authenticated(`/api/conversations/${created.id}/threads`);
    expect(threadsResponse.status).toBe(200);
    expect(await threadsResponse.json()).toEqual({ threads: [] });

    const invalidThreadResponse = await authenticated(`/api/conversations/${created.id}/threads`, {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(invalidThreadResponse.status).toBe(400);
    expect(await invalidThreadResponse.json()).toEqual({ error: "Invalid thread" });

    const missingThreadResponse = await authenticated(
      `/api/conversations/${created.id}/threads/missing-thread`,
    );
    expect(missingThreadResponse.status).toBe(404);
    expect(await missingThreadResponse.json()).toEqual({ error: "Thread not found" });

    const memoryResponse = await authenticated("/api/memories", {
      body: JSON.stringify({ content: "Worker memory" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(memoryResponse.status).toBe(201);
    const memory = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(
      await memoryResponse.json(),
    );
    const memoriesResponse = await authenticated("/api/memories?search=worker");
    const memories = Schema.decodeUnknownSync(
      Schema.Struct({ memories: Schema.Array(Schema.Struct({ content: Schema.String })) }),
    )(await memoriesResponse.json());
    expect(memories.memories).toHaveLength(1);

    const invalidMemoryResponse = await authenticated("/api/memories", {
      body: JSON.stringify({ content: "" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(invalidMemoryResponse.status).toBe(400);
    expect(await invalidMemoryResponse.json()).toEqual({ error: "Invalid memory" });

    const deletedMemoryResponse = await authenticated(`/api/memories/${memory.id}`, {
      method: "DELETE",
    });
    expect(await deletedMemoryResponse.json()).toEqual({ deleted: true });

    const clonedResponse = await authenticated(`/api/conversations/${created.id}/clone`, {
      method: "POST",
    });
    expect(clonedResponse.status).toBe(201);
    const cloned = Schema.decodeUnknownSync(
      Schema.Struct({
        conversation: Schema.Struct({ id: Schema.String, title: Schema.NullOr(Schema.String) }),
      }),
    )(await clonedResponse.json()).conversation;
    expect(cloned.title).toBe("Worker lifecycle copy");

    const invalidChatResponse = await authenticated("/api/chat", {
      body: JSON.stringify({
        config: { apiKey: "key", model: "model", provider: "openai" },
        messages: [
          {
            id: "message-1",
            parts: Array.from({ length: 11 }, () => ({ type: "image", image: "x" })),
            role: "user",
          },
        ],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(invalidChatResponse.status).toBe(400);
    expect(await invalidChatResponse.json()).toEqual({
      error: "Too many attachments. Maximum 10 per message.",
    });

    expect(
      await (await authenticated(`/api/conversations/${cloned.id}`, { method: "DELETE" })).json(),
    ).toEqual({ deleted: true });
    expect(
      await (await authenticated(`/api/conversations/${created.id}`, { method: "DELETE" })).json(),
    ).toEqual({ deleted: true });
  }, 15_000);

  it("streams through an OpenAI-compatible provider and persists the generation", async () => {
    const provider = await startProvider();
    try {
      const authResponse = await fetch(`${apiOrigin}/api/auth/sign-in/anonymous`, {
        headers: { origin: process.env.GENERIC_AUTH_ORIGIN ?? apiOrigin },
        method: "POST",
      });
      expect(authResponse.status).toBe(201);
      const setCookie = authResponse.headers.get("set-cookie");
      const cookie = setCookie?.split(";", 1)[0];
      expect(cookie).toBeTruthy();

      const response = await fetch(`${apiOrigin}/api/chat`, {
        body: JSON.stringify({
          config: {
            apiKey: "generic-provider-key",
            baseUrl: provider.baseUrl,
            model: "test-model",
            provider: "openai",
          },
          memory: { enabled: false },
          messages: [
            {
              id: "generic-user-message",
              parts: [{ text: "Hello generic Worker", type: "text" }],
              role: "user",
            },
          ],
        }),
        headers: { "content-type": "application/json", cookie: cookie ?? "" },
        method: "POST",
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      const conversationId = response.headers.get("x-conversation-id");
      expect(conversationId).toBeTruthy();
      expect(await response.text()).toContain("generic provider reply");

      expect(
        await hasPersistedProviderReply({
          apiOrigin,
          attempts: 20,
          conversationId: conversationId ?? "",
          cookie: cookie ?? "",
        }),
      ).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) =>
        provider.server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    }
  }, 15_000);
});
