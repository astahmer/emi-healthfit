import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { ChatServer } from "../../src/server/index.ts";
import { ChatServerEffect } from "../../src/server/effect/index.ts";
import { ChatFetchHandlers } from "../../src/server/fetch/index.ts";

const message = {
  id: "message-1",
  role: "user" as const,
  parts: [{ type: "text" as const, text: "Hello" }],
  createdAt: "2026-08-02T00:00:00.000Z",
};

const makeOptions = (events: Array<string>) => ({
  auth: {
    authenticate: () =>
      Effect.sync(() => {
        events.push("auth");
        return { subject: "user-1" };
      }),
  },
  repositories: {
    conversations: {
      list: () =>
        Effect.sync(() => {
          events.push("conversations.list");
          return [
            {
              id: "conversation-1",
              title: "Planning",
              status: "regular" as const,
              pinned: false,
              createdAt: "2026-08-02T00:00:00.000Z",
              updatedAt: "2026-08-02T00:00:00.000Z",
            },
          ];
        }),
    },
    messages: {
      append: () =>
        Effect.sync(() => {
          events.push("messages.append");
        }),
    },
    generations: {
      admit: () =>
        Effect.sync(() => {
          events.push("generations.admit");
        }),
      append: () =>
        Effect.sync(() => {
          events.push("generations.append");
        }),
    },
    memories: {
      list: () => Effect.succeed([]),
    },
  },
  model: {
    generate: () =>
      Stream.unwrap(
        Effect.sync(() => {
          events.push("model.generate");
          return Stream.fromIterable([
            { type: "started" as const, generationId: "generation-1" },
            { type: "completed" as const, message },
          ]);
        }),
      ),
  },
  configuration: { model: "generic-model" },
});

describe("@emi/core/server Effect-first surface", () => {
  it("uses domain classes and preserves Effect composition", async () => {
    const events: Array<string> = [];
    const server = new ChatServer(makeOptions(events));
    const conversations = await Effect.runPromise(
      server.listConversations(new Request("https://example.test/api/conversations")),
    );

    assert.equal(conversations[0]?.id, "conversation-1");
    assert.deepEqual(events, ["auth", "conversations.list"]);
    assert.equal(typeof ChatServerEffect.create, "function");
    assert.ok(await Effect.runPromise(ChatServerEffect.create(makeOptions([]))));
  });

  it("admits a generation before message persistence and model execution", async () => {
    const events: Array<string> = [];
    const server = new ChatServer(makeOptions(events));
    const output = await Effect.runPromise(
      Stream.runCollect(
        server.generate(new Request("https://example.test/api/chat"), {
          requestId: "request-1",
          conversationId: "conversation-1",
          message,
        }),
      ),
    );

    assert.equal(output.length, 2);
    assert.deepEqual(events, [
      "auth",
      "generations.admit",
      "messages.append",
      "model.generate",
      "generations.append",
      "generations.append",
    ]);
  });

  it("derives a Promise Fetch adapter from the server Effect", async () => {
    const server = new ChatServer(makeOptions([]));
    const response = await new ChatFetchHandlers(server).handle(
      new Request("https://example.test/api/conversations"),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [
      {
        id: "conversation-1",
        title: "Planning",
        status: "regular",
        pinned: false,
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    ]);
  });
});
