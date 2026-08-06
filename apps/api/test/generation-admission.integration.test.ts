import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Cloudflare from "alchemy/Cloudflare";
import { RuntimeContext } from "alchemy";
import * as Effect from "effect/Effect";
import { fromWeb } from "effect/unstable/http/HttpServerRequest";
import { Cloudflare as CoreCloudflare } from "@emi/core/cloudflare";
import { ServerDatabase } from "@emi/core/server/database";
import { handleAiSdkChat } from "../src/chat/generation-lifecycle.ts";
import { makeFakeBucket } from "./fake-bucket.ts";
import { narrowQueryDatabaseClient, type DatabaseSchema } from "../src/platform/db/client.ts";
import { makeConversationDatabase, makeSqliteDatabase, run } from "./sqlite.ts";

const user = {
  id: "admission-user",
  email: "admission@example.com",
  name: "Admission",
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
    id: "admission-generation",
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
            index: 0,
            message: { content: "Compacted admission context", role: "assistant" },
          },
        ],
        created: 1,
        id: "admission-summary",
        model: "test-model",
        object: "chat.completion",
        usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
      }),
      { headers: { "content-type": "application/json" } },
    );
  }
  return new Response(
    [
      `data: ${providerChunk({ content: "Winner reply" })}`,
      `data: ${providerChunk({ finishReason: "stop" })}`,
      "data: [DONE]",
      "",
    ].join("\n\n"),
    { headers: { "content-type": "text/event-stream" } },
  );
};

const chatBody = ({
  conversationId,
  requestId,
  message,
}: {
  conversationId: string;
  requestId: string;
  message: string;
}) =>
  JSON.stringify({
    config: {
      apiKey: "test-key",
      baseUrl: "http://127.0.0.1:1/v1",
      model: "test-model",
      provider: "openai",
    },
    messages: [
      {
        id: `message-${requestId}`,
        createdAt: "2026-08-06T00:00:00.000Z",
        parts: [{ text: message, type: "text" }],
        role: "user",
      },
    ],
    requestId,
    sessionId: conversationId,
    tokenBudget: 1500,
  });

const requestFor = ({
  conversationId,
  requestId,
  message,
}: {
  conversationId: string;
  requestId: string;
  message: string;
}) =>
  fromWeb(
    new Request("https://api.example.com/api/chat", {
      body: chatBody({ conversationId, requestId, message }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );

describe("chat generation admission", () => {
  it("rejects a concurrent loser before it compacts or persists anything", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = rawDb;
    const conversationDatabase = await makeConversationDatabase(
      narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(db),
    );
    const conversationId = await run(
      conversationDatabase.createConversation({ userId: user.id, title: "Admission test" }),
    );
    await run(
      conversationDatabase.saveConversationMessages({
        userId: user.id,
        conversationId,
        parentId: null,
        messages: [
          {
            role: "assistant",
            parts: [{ type: "text", text: "Expensive prior reply" }],
            usage: { prompt_tokens: 2000, completion_tokens: 1000, total_tokens: 3000 },
          },
        ],
      }),
    );

    let releaseFirstGenerationCreate: (() => void) | undefined;
    let markGenerationCreateEntered: (() => void) | undefined;
    const generationCreateEntered = new Promise<void>((resolve) => {
      markGenerationCreateEntered = resolve;
    });
    const firstGenerationCreateReleased = new Promise<void>((resolve) => {
      releaseFirstGenerationCreate = resolve;
    });
    let gateNextGenerationInsert = true;
    const rawClient = Effect.runSync(rawDb.raw);
    const gatedRaw = {
      ...rawClient,
      prepare: (sql: string) => {
        const statement = rawClient.prepare(sql);
        if (!/insert into "chat_generations"/i.test(sql)) return statement;
        const gate = async () => {
          if (!gateNextGenerationInsert) return;
          gateNextGenerationInsert = false;
          markGenerationCreateEntered?.();
          await firstGenerationCreateReleased;
        };
        const wrapExecutables = (target: typeof statement) => {
          const all = target.all.bind(target);
          target.all = async (...args: Parameters<typeof all>) => {
            await gate();
            return all(...args);
          };
          if (typeof target.run === "function") {
            const run = target.run.bind(target);
            target.run = async (...args: Parameters<typeof run>) => {
              await gate();
              return run(...args);
            };
          }
          if (typeof target.bind === "function") {
            const bind = target.bind.bind(target);
            target.bind = (...args: Parameters<typeof bind>) => wrapExecutables(bind(...args));
          }
          return target;
        };
        return wrapExecutables(statement);
      },
    };
    const gatedDatabase = {
      ...rawDb,
      kysely: Effect.map(rawDb.kysely, () =>
        CoreCloudflare.database.makeD1Kysely<DatabaseSchema>(
          gatedRaw as unknown as Parameters<typeof CoreCloudflare.database.makeD1Kysely>[0],
        ),
      ),
    };

    const runChat = (request: ReturnType<typeof requestFor>) =>
      Effect.runPromise(
        handleAiSdkChat(gatedDatabase, request, {}, {}, makeFakeBucket().bucket).pipe(
          Effect.provide(RuntimeContext.phantom),
          Effect.provideService(CoreCloudflare.user.CurrentUser, user),
          Effect.provideService(Cloudflare.Workers.WorkerExecutionContext, {
            waitUntil: () => undefined,
          } as unknown as ExecutionContext),
        ),
      );

    const previousFetch = globalThis.fetch;
    globalThis.fetch = providerResponse;
    try {
      const loser = runChat(
        requestFor({
          conversationId,
          requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          message: "Loser message",
        }),
      );
      await generationCreateEntered;
      const winner = runChat(
        requestFor({
          conversationId,
          requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          message: "Winner message",
        }),
      );
      const winnerOutcome = await winner.then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason) => ({ status: "rejected" as const, reason }),
      );
      releaseFirstGenerationCreate?.();
      const loserOutcome = await loser.then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason) => ({ status: "rejected" as const, reason }),
      );

      assert.equal(winnerOutcome.status, "fulfilled");
      assert.equal(loserOutcome.status, "fulfilled");
      if (winnerOutcome.status === "fulfilled") assert.equal(winnerOutcome.value.status, 200);
      if (loserOutcome.status === "fulfilled") assert.equal(loserOutcome.value.status, 409);

      const rows = await run(
        conversationDatabase.getConversationMessages({ userId: user.id, conversationId }),
      );
      assert.equal(rows.filter((row) => row.role === "summary").length, 1);
      const userMessages = rows.filter((row) => row.role === "user");
      assert.deepEqual(
        userMessages.map((row) => row.id),
        ["message-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
