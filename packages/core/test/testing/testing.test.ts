import assert from "node:assert/strict";
import { Effect } from "effect";
import { describe, it } from "node:test";

import { ChatTesting } from "../../src/testing.export.ts";
import { ChatServerError } from "../../src/server.export.ts";

describe("ChatTesting", () => {
  it("provides deterministic injected dependencies", () => {
    const dependencies = ChatTesting.deterministicDependencies();
    assert.equal(dependencies.now(), "2026-01-01T00:00:00.000Z");
    assert.equal(dependencies.createId(), "test-id-1");
    assert.equal(dependencies.createId(), "test-id-2");
  });

  it("provides real in-memory repositories with typed generation conflicts", async () => {
    const repositories = ChatTesting.inMemoryRepositories();
    const input = {
      subject: "user-1",
      requestId: "request-1",
      conversationId: "conversation-1",
    };
    await Effect.runPromise(repositories.generations.admit(input));

    await assert.rejects(Effect.runPromise(repositories.generations.admit(input)), (error) => {
      assert.ok(error instanceof ChatServerError);
      assert.equal(error.kind, "conflict");
      return true;
    });
  });
});
