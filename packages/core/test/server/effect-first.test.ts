import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { ChatServerEffect } from "../../src/server-effect.export.ts";
import { ChatFetchHandlers } from "../../src/server-fetch.export.ts";
import type {
  AuthPortShape,
  ChatModelShape,
  ChatRepositoriesShape,
  ChatServerConfigurationShape,
} from "../../src/server/ports/chat-server.ts";
import type { ChatServer as ChatServerServiceTag } from "../../src/server/use-cases/chat-server.ts";

const AuthPort = ChatServerEffect.AuthPort;
const ChatModel = ChatServerEffect.ChatModel;
const ChatRepositories = ChatServerEffect.ChatRepositories;
const ChatServer = ChatServerEffect.Server;
const ChatServerConfiguration = ChatServerEffect.Configuration;
const ChatServerError = ChatServerEffect.Error;
const ChatServerLive = ChatServerEffect.Live;

const message = {
  id: "message-1",
  role: "user" as const,
  parts: [{ type: "text" as const, text: "Hello" }],
  createdAt: "2026-08-02T00:00:00.000Z",
};

const makeServices = (events: Array<string>, authOverride?: AuthPortShape) => {
  const auth =
    authOverride ??
    ({
      authenticate: () =>
        Effect.sync(() => {
          events.push("auth");
          return { subject: "user-1" };
        }),
    } satisfies AuthPortShape);
  const repositories: ChatRepositoriesShape = {
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
    memories: { list: () => Effect.succeed([]) },
  };
  const model: ChatModelShape = {
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
  };
  const configuration: ChatServerConfigurationShape = {
    model: { model: "generic-model" },
    extensions: [],
  };
  const ports = Layer.mergeAll(
    Layer.succeed(AuthPort, auth),
    Layer.succeed(ChatRepositories, repositories),
    Layer.succeed(ChatModel, model),
    Layer.succeed(ChatServerConfiguration, configuration),
  );
  return ChatServerLive.pipe(Layer.provide(ports));
};

const useServer = <Value, Error, Environment>(
  layer: Layer.Layer<ChatServerServiceTag, Error, Environment>,
  effect: (server: ChatServerServiceTag["Service"]) => Effect.Effect<Value, Error>,
) => ChatServer.use(effect).pipe(Effect.provide(layer));

describe("@emi/core/server Effect-first surface", () => {
  it("uses Context services and preserves Effect composition", async () => {
    const events: Array<string> = [];
    const conversations = await Effect.runPromise(
      useServer(
        makeServices(events),
        (server) => server.listConversations(new Request("https://example.test/api/conversations")),
      ),
    );

    assert.equal(conversations[0]?.id, "conversation-1");
    assert.deepEqual(events, ["auth", "conversations.list"]);
  });

  it("admits a generation before message persistence and model execution", async () => {
    const events: Array<string> = [];
    const output = await Effect.runPromise(
      useServer(makeServices(events), (server) =>
        Stream.runCollect(
          server.generate(new Request("https://example.test/api/chat"), {
            requestId: "request-1",
            conversationId: "conversation-1",
            message,
          }),
        ),
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

  it("keeps admission conflicts typed and prevents orphan message persistence", async () => {
    const events: Array<string> = [];
    const conflictRepositories: ChatRepositoriesShape = {
      conversations: {
        list: () => Effect.succeed([]),
      },
      messages: {
        append: () => Effect.succeed(undefined),
      },
      generations: {
        admit: () => {
          events.push("generations.admit");
          return Effect.fail(
            new ChatServerError({ kind: "conflict", message: "A generation is already active." }),
          );
        },
        append: () => Effect.succeed(undefined),
      },
      memories: { list: () => Effect.succeed([]) },
    };
    const conflictPorts = Layer.mergeAll(
      Layer.succeed(AuthPort, {
        authenticate: () => Effect.succeed({ subject: "user-1" }),
      }),
      Layer.succeed(ChatRepositories, conflictRepositories),
      Layer.succeed(ChatModel, { generate: () => Stream.empty }),
      Layer.succeed(ChatServerConfiguration, { model: { model: "generic-model" }, extensions: [] }),
    );
    const exit = await Effect.runPromiseExit(
      ChatServer.use((server) =>
        Stream.runCollect(
          server.generate(new Request("https://example.test/api/chat"), {
            requestId: "request-1",
            conversationId: "conversation-1",
            message,
          }),
        ),
      ).pipe(Effect.provide(ChatServerLive.pipe(Layer.provide(conflictPorts)))),
    );

    assert.equal(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) assert.match(String(exit.cause), /ChatServerError/);
    assert.deepEqual(events, ["generations.admit"]);
  });

  it("decodes generation input before calling injected ports", async () => {
    const events: Array<string> = [];
    const exit = await Effect.runPromiseExit(
      useServer(makeServices(events), (server) =>
        Stream.runCollect(
          server.generate(new Request("https://example.test/api/chat"), {
            requestId: "",
            conversationId: "conversation-1",
            message,
          }),
        ),
      ),
    );

    assert.equal(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) assert.match(String(exit.cause), /ChatServerError/);
    assert.deepEqual(events, []);
  });

  it("derives the Promise Fetch adapter from the server Effect", async () => {
    const serverLayer = makeServices([]);
    const fetchLayer = ChatFetchHandlers.layer().pipe(Layer.provide(serverLayer));
    const response = await ChatFetchHandlers.handle({
      layer: fetchLayer,
      request: new Request("https://example.test/api/conversations"),
    });

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

  it("maps typed server failures at the Promise adapter boundary", async () => {
    const layer = makeServices([], {
      authenticate: () =>
        Effect.fail(new ChatServerError({ kind: "unauthorized", message: "Sign in required." })),
    });
    const response = await ChatFetchHandlers.handle({
      layer: ChatFetchHandlers.layer().pipe(Layer.provide(layer)),
      request: new Request("https://example.test/api/conversations"),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: { kind: "unauthorized", message: "Sign in required." },
    });
  });
});
