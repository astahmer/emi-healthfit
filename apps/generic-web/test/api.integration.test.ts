import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import { createConversationClient } from "@emi/core/web";

const apiOrigin = process.env.GENERIC_API_ORIGIN ?? "http://127.0.0.1:3233";
const expectedWorkerName = process.env.GENERIC_EXPECTED_APP_NAME ?? "Core Chat";

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

    const searchResponse = await authenticated("/api/conversations?search=lifecycle");
    const searched = Schema.decodeUnknownSync(
      Schema.Struct({
        conversations: Schema.Array(Schema.Struct({ id: Schema.String })),
      }),
    )(await searchResponse.json());
    expect(searched.conversations.map((conversation) => conversation.id)).toContain(created.id);

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

    expect(
      await (await authenticated(`/api/conversations/${cloned.id}`, { method: "DELETE" })).json(),
    ).toEqual({ deleted: true });
    expect(
      await (await authenticated(`/api/conversations/${created.id}`, { method: "DELETE" })).json(),
    ).toEqual({ deleted: true });
  }, 15_000);
});
