import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { describe, it } from "node:test";

import { CoreApiClient, CoreApiClientError } from "../../src/api.export.ts";

const conversation = {
  id: "conversation-1",
  title: "A conversation",
  status: "regular",
  pinned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const listen = (server: Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("Server did not bind.");
      resolve(address.port);
    });
  });

describe("CoreApiClient", () => {
  it("derives a Promise consumer from its Effect-first conversation operation", async () => {
    const server = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([conversation]));
    });
    const port = await listen(server);

    try {
      const client = CoreApiClient.create({
        baseUrl: `http://127.0.0.1:${port}`,
        fetch,
      });
      const conversations = await CoreApiClient.runPromise(client.conversations.list());
      assert.deepEqual(conversations, [conversation]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("keeps transport failures typed", async () => {
    const server = createServer((_request, response) => {
      response.statusCode = 503;
      response.end(JSON.stringify({ error: "offline" }));
    });
    const port = await listen(server);

    try {
      const client = CoreApiClient.create({
        baseUrl: `http://127.0.0.1:${port}`,
        fetch,
      });
      await assert.rejects(CoreApiClient.runPromise(client.conversations.list()), (error) => {
        assert.ok(error instanceof CoreApiClientError);
        assert.equal(error.kind, "http");
        return true;
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
