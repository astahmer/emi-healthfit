import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Cloudflare from "alchemy/Cloudflare";
import { RuntimeContext } from "alchemy";
import * as Effect from "effect/Effect";
import { fromWeb } from "effect/unstable/http/HttpServerRequest";
import { Cloudflare as CoreCloudflare } from "@emi/core/cloudflare";
import type { CloudflareQueryDatabaseClient } from "@emi/core/cloudflare";
import { ServerDatabase } from "@emi/core/server/database";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeLayerRunner, makeSqliteDatabase } from "./sqlite.ts";

const user = {
  id: "core-route-user",
  email: "core-route@example.com",
  name: "Core Route",
  image: null,
};

const providerChunk = ({ content, finishReason }: { content?: string; finishReason?: string }) =>
  JSON.stringify({
    choices: [
      {
        delta: content === undefined ? {} : { content, role: "assistant" },
        finish_reason: finishReason ?? null,
        index: 0,
      },
    ],
    created: 1,
    id: "core-route-generation",
    model: "test-model",
    object: "chat.completion.chunk",
  });

const providerResponse = async (_input: RequestInfo | URL, init?: RequestInit) => {
  const requestBody = String(init?.body ?? "");
  if (!requestBody.includes('"stream":true')) {
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: "Generated title", role: "assistant" },
          },
        ],
        created: 1,
        id: "core-route-generation",
        model: "test-model",
        object: "chat.completion",
        usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
      }),
      { headers: { "content-type": "application/json" } },
    );
  }
  return new Response(
    [
      `data: ${providerChunk({ content: "Generated reply" })}`,
      `data: ${providerChunk({ finishReason: "stop" })}`,
      "data: [DONE]",
      "",
    ].join("\n\n"),
    { headers: { "content-type": "text/event-stream" } },
  );
};

const chatBody = ({ conversationId, requestId }: { conversationId: string; requestId: string }) =>
  JSON.stringify({
    config: {
      apiKey: "test-key",
      baseUrl: "http://127.0.0.1:1/v1",
      model: "test-model",
      provider: "openai",
    },
    memory: { enabled: false },
    messages: [
      {
        id: `message-${requestId}`,
        createdAt: "2026-08-02T00:00:00.000Z",
        parts: [{ text: `User message ${requestId}`, type: "text" }],
        role: "user",
      },
    ],
    requestId,
    sessionId: conversationId,
  });

const requestFor = ({ conversationId, requestId }: { conversationId: string; requestId: string }) =>
  fromWeb(
    new Request("https://core.example.com/api/chat", {
      body: chatBody({ conversationId, requestId }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );

describe("generic core chat route", () => {
  it("admits the generation before persisting a concurrent user message", async () => {
    const { db: database } = makeSqliteDatabase();
    const conversationDatabase =
      narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(database);
    const runConversation = makeLayerRunner(
      ServerDatabase.conversations.layer({ db: conversationDatabase }),
    );
    const conversationId = await runConversation(
      ServerDatabase.conversations.createConversation({
        userId: user.id,
        title: "Concurrent route test",
      }),
    );

    let firstMessageBatch = true;
    let releaseFirstMessage: (() => void) | undefined;
    let resolveMessagePersistenceEntered: (() => void) | undefined;
    const messagePersistenceEntered = new Promise<void>((resolve) => {
      resolveMessagePersistenceEntered = resolve;
    });
    const firstMessageReleased = new Promise<void>((resolve) => {
      releaseFirstMessage = resolve;
    });
    const gatedDatabase = {
      ...database,
      batch: (statements: Parameters<typeof database.batch>[0]) =>
        Effect.gen(function* () {
          const insertsMessage = statements.some((statement) =>
            statement.compile().sql.toLowerCase().includes('insert into "messages"'),
          );
          if (insertsMessage && firstMessageBatch) {
            firstMessageBatch = false;
            resolveMessagePersistenceEntered?.();
            yield* Effect.promise(() => firstMessageReleased);
          }
          return yield* database.batch(statements);
        }),
    };
    const routes = CoreCloudflare.routes.makeGenericChatRoutes({
      db: gatedDatabase as unknown as CloudflareQueryDatabaseClient<
        ServerDatabase.ConversationDatabaseSchema & ServerDatabase.MemoryDatabaseSchema
      >,
    });
    const pendingTasks: Promise<unknown>[] = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = providerResponse;
    const runChat = (request: ReturnType<typeof requestFor>) => {
      const providedChat = routes.chat(request).pipe(
        Effect.provide(RuntimeContext.phantom),
        Effect.provideService(CoreCloudflare.user.CurrentUser, user),
        Effect.provideService(Cloudflare.Workers.WorkerExecutionContext, {
          waitUntil: (promise: Promise<unknown>) => pendingTasks.push(promise),
        }),
      );
      return Effect.runPromise(
        providedChat as Effect.Effect<
          Effect.Success<typeof providedChat>,
          Effect.Error<typeof providedChat>,
          never
        >,
      );
    };

    try {
      const firstRequest = runChat(
        requestFor({
          conversationId,
          requestId: "11111111-1111-4111-8111-111111111111",
        }),
      );
      await Promise.race([
        messagePersistenceEntered,
        firstRequest.then(
          () => Promise.reject(new Error("First chat request completed before persistence")),
          (error) => Promise.reject(error),
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timed out waiting for message persistence")), 1_000),
        ),
      ]);
      const secondRequest = runChat(
        requestFor({
          conversationId,
          requestId: "22222222-2222-4222-8222-222222222222",
        }),
      );
      const outcomes = await Promise.allSettled([
        firstRequest,
        secondRequest.finally(() => releaseFirstMessage?.()),
      ]);
      assert.equal(outcomes[0]?.status, "fulfilled");
      assert.equal(outcomes[1]?.status, "fulfilled");
      if (outcomes[0]?.status === "fulfilled") assert.equal(outcomes[0].value.status, 200);
      if (outcomes[1]?.status === "fulfilled") assert.equal(outcomes[1].value.status, 409);
      await Promise.allSettled(pendingTasks);

      const messages = await runConversation(
        ServerDatabase.conversations.getConversationMessages({
          userId: user.id,
          conversationId,
        }),
      );
      const userMessages = messages.filter((message) => message.role === "user");
      assert.equal(userMessages.length, 1);
      assert.equal(userMessages[0]?.id, "message-11111111-1111-4111-8111-111111111111");
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
