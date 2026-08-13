import assert from "node:assert";
import { describe, it } from "node:test";
import { ServerDatabase } from "@emi/core/server/database";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import {
  makeConversationDatabase,
  makeGenerationDatabase,
  makeSqliteDatabase,
  run,
} from "./sqlite.ts";

describe("generation store SQLite integration", () => {
  it("persists streaming lifecycle, ordered chunks, events, reconciliation, expiry, and cleanup", async () => {
    const { db: database, sqlite } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(database);
    const generationDatabase = await makeGenerationDatabase(db);
    const conversationDatabase = await makeConversationDatabase(db);
    const userId = "user-a";
    const conversationId = await run(
      conversationDatabase.createConversation({ userId, title: "Streaming" }),
    );

    await run(
      generationDatabase.createGeneration({
        userId,
        generationId: "generation-a",
        conversationId,
        requestId: "request-a",
        traceId: "trace-a",
        model: "gpt-5",
      }),
    );
    assert.strictEqual(
      (await run(generationDatabase.getGeneration({ userId, generationId: "generation-a" })))
        ?.status,
      "pending",
    );
    assert.strictEqual(
      (
        await run(
          generationDatabase.getGenerationByRequestId({
            userId,
            conversationId,
            requestId: "request-a",
          }),
        )
      )?.id,
      "generation-a",
    );
    assert.strictEqual(
      await run(
        generationDatabase.getGenerationByRequestId({
          userId,
          conversationId,
          requestId: "another-request",
        }),
      ),
      null,
    );
    await run(generationDatabase.markGenerationStreaming({ userId, generationId: "generation-a" }));
    await run(
      generationDatabase.updateGenerationMetadata({
        userId,
        generationId: "generation-a",
        finishReason: "stop",
        inputTokens: 10,
        outputTokens: 20,
      }),
    );
    await run(
      generationDatabase.appendGenerationChunks({
        userId,
        generationId: "generation-a",
        chunks: [
          { sequence: 0, chunk: { type: "start" } },
          { sequence: 1, chunk: { type: "finish" } },
        ],
      }),
    );
    await run(
      generationDatabase.recordChatEvent({
        userId,
        conversationId,
        generationId: "generation-a",
        requestId: "request-a",
        traceId: "trace-a",
        type: "provider.started",
        payload: { provider: "openai" },
      }),
    );

    assert.deepStrictEqual(
      await run(
        generationDatabase.getGenerationChunks({
          userId,
          generationId: "generation-a",
          afterSequence: 0,
        }),
      ),
      [{ sequence: 1, chunk: { type: "finish" } }],
    );
    assert.strictEqual(
      (await run(generationDatabase.getRunningGeneration({ userId, conversationId })))?.id,
      "generation-a",
    );
    assert.deepStrictEqual(
      sqlite
        .prepare("SELECT type, payload FROM chat_events")
        .all()
        .map((row) => ({ ...row })),
      [{ type: "provider.started", payload: JSON.stringify({ provider: "openai" }) }],
    );

    await run(
      generationDatabase.finishGeneration({
        userId,
        generationId: "generation-a",
        status: "completed",
        finishReason: "stop",
        inputTokens: 11,
        outputTokens: 21,
      }),
    );
    assert.deepStrictEqual(
      {
        status: (
          await run(generationDatabase.getGeneration({ userId, generationId: "generation-a" }))
        )?.status,
        input: (
          await run(generationDatabase.getGeneration({ userId, generationId: "generation-a" }))
        )?.input_tokens,
        output: (
          await run(generationDatabase.getGeneration({ userId, generationId: "generation-a" }))
        )?.output_tokens,
      },
      { status: "completed", input: 11, output: 21 },
    );
    assert.strictEqual(
      await run(generationDatabase.getResumableGeneration({ userId, conversationId })),
      null,
    );

    await run(
      generationDatabase.createGeneration({
        userId,
        generationId: "generation-b",
        conversationId,
      }),
    );
    await run(
      generationDatabase.appendGenerationChunk({
        userId,
        generationId: "generation-b",
        sequence: 0,
        chunk: { type: "finish" },
      }),
    );
    assert.strictEqual(await run(generationDatabase.reconcileFinishedGenerations({ userId })), 1);
    assert.strictEqual(
      (await run(generationDatabase.getGeneration({ userId, generationId: "generation-b" })))
        ?.status,
      "completed",
    );

    await run(
      generationDatabase.createGeneration({
        userId,
        generationId: "generation-c",
        conversationId,
      }),
    );
    await run(generationDatabase.markGenerationStreaming({ userId, generationId: "generation-c" }));
    sqlite
      .prepare("UPDATE chat_generations SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = ?")
      .run("generation-c");
    assert.strictEqual(await run(generationDatabase.expireStaleGenerations({ userId })), 1);
    assert.deepStrictEqual(
      {
        status: (
          await run(generationDatabase.getGeneration({ userId, generationId: "generation-c" }))
        )?.status,
        error: (
          await run(generationDatabase.getGeneration({ userId, generationId: "generation-c" }))
        )?.error,
      },
      { status: "timed_out", error: "Generation timed out" },
    );
    assert.strictEqual(
      (await run(generationDatabase.getResumableGeneration({ userId, conversationId })))?.id,
      "generation-c",
    );

    await run(
      generationDatabase.createGeneration({
        userId,
        generationId: "generation-d",
        conversationId,
      }),
    );
    await run(
      generationDatabase.finishGeneration({
        userId,
        generationId: "generation-d",
        status: "failed",
        error: "Provider unavailable",
      }),
    );
    sqlite
      .prepare("UPDATE chat_generations SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = ?")
      .run("generation-d");
    assert.strictEqual(
      await run(generationDatabase.cleanupGenerationHistory({ userId, retentionDays: 7 })),
      1,
    );
    assert.strictEqual(
      await run(generationDatabase.getGeneration({ userId, generationId: "generation-d" })),
      null,
    );
  });

  it("cancels running generations for a conversation without touching finished ones", async () => {
    const { db: database } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(database);
    const generationDatabase = await makeGenerationDatabase(db);
    const conversationDatabase = await makeConversationDatabase(db);
    const userId = "user-cancel";
    const conversationId = await run(
      conversationDatabase.createConversation({ userId, title: "Cancel running" }),
    );

    await run(
      generationDatabase.createGeneration({
        userId,
        generationId: "running-a",
        conversationId,
      }),
    );
    await run(generationDatabase.markGenerationStreaming({ userId, generationId: "running-a" }));

    assert.strictEqual(
      await run(
        generationDatabase.cancelRunningGenerations({
          userId,
          conversationId,
          reason: "superseded",
          error: "Superseded by a newer request",
        }),
      ),
      1,
    );
    assert.strictEqual(
      (await run(generationDatabase.getGeneration({ userId, generationId: "running-a" })))?.status,
      "cancelled",
    );
    assert.strictEqual(
      await run(generationDatabase.getRunningGeneration({ userId, conversationId })),
      null,
    );

    await run(
      generationDatabase.createGeneration({
        userId,
        generationId: "next-c",
        conversationId,
      }),
    );
    await run(
      generationDatabase.finishGeneration({
        userId,
        generationId: "next-c",
        status: "completed",
        finishReason: "stop",
      }),
    );
    assert.strictEqual(
      (await run(generationDatabase.getGeneration({ userId, generationId: "next-c" })))?.status,
      "completed",
    );
    assert.strictEqual(
      await run(
        generationDatabase.cancelRunningGenerations({
          userId,
          conversationId,
          reason: "superseded",
        }),
      ),
      0,
    );
  });

  it("ignores late finishGeneration after a generation was cancelled", async () => {
    const { db: database } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(database);
    const generationDatabase = await makeGenerationDatabase(db);
    const conversationDatabase = await makeConversationDatabase(db);
    const userId = "user-late-finish";
    const conversationId = await run(
      conversationDatabase.createConversation({ userId, title: "Late finish" }),
    );

    await run(
      generationDatabase.createGeneration({
        userId,
        generationId: "cancelled-a",
        conversationId,
      }),
    );
    await run(generationDatabase.markGenerationStreaming({ userId, generationId: "cancelled-a" }));
    assert.strictEqual(
      await run(
        generationDatabase.finishGeneration({
          userId,
          generationId: "cancelled-a",
          status: "cancelled",
          finishReason: "client_stopped",
          error: "Stopped by client",
        }),
      ),
      true,
    );
    assert.strictEqual(
      await run(
        generationDatabase.finishGeneration({
          userId,
          generationId: "cancelled-a",
          status: "completed",
          finishReason: "stop",
        }),
      ),
      false,
    );
    assert.strictEqual(
      (await run(generationDatabase.getGeneration({ userId, generationId: "cancelled-a" })))
        ?.status,
      "cancelled",
    );
  });

  it("cancel-then-create unlocks the one-active unique index", async () => {
    const { db: database } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(database);
    const generationDatabase = await makeGenerationDatabase(db);
    const conversationDatabase = await makeConversationDatabase(db);
    const userId = "user-supersede";
    const conversationId = await run(
      conversationDatabase.createConversation({ userId, title: "Supersede" }),
    );

    await run(
      generationDatabase.createGeneration({
        userId,
        generationId: "first",
        conversationId,
      }),
    );
    await run(generationDatabase.markGenerationStreaming({ userId, generationId: "first" }));
    await run(
      generationDatabase.cancelRunningGenerations({
        userId,
        conversationId,
        reason: "superseded",
        error: "Superseded by a newer request",
      }),
    );
    await run(
      generationDatabase.createGeneration({
        userId,
        generationId: "second",
        conversationId,
      }),
    );
    assert.strictEqual(
      (await run(generationDatabase.getGeneration({ userId, generationId: "second" })))?.status,
      "pending",
    );
    assert.strictEqual(
      (await run(generationDatabase.getGeneration({ userId, generationId: "first" })))?.status,
      "cancelled",
    );
  });

  it("rejects a second active generation for the same conversation", async () => {
    const { db: database } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(database);
    const generationDatabase = await makeGenerationDatabase(db);
    const conversationDatabase = await makeConversationDatabase(db);
    const userId = "user-unique";
    const conversationId = await run(
      conversationDatabase.createConversation({ userId, title: "Unique active" }),
    );

    await run(
      generationDatabase.createGeneration({
        userId,
        generationId: "active-1",
        conversationId,
      }),
    );

    await assert.rejects(
      () =>
        run(
          generationDatabase.createGeneration({
            userId,
            generationId: "active-2",
            conversationId,
          }),
        ),
      (error: unknown) => {
        assert.equal(
          error instanceof Error && error.name === "GenerationAlreadyActiveError"
            ? true
            : String(error).includes("GenerationAlreadyActiveError"),
          true,
        );
        return true;
      },
    );
  });

  it("repairs terminal generations whose assistant reply was never persisted", async () => {
    const { db: database } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(database);
    const generationDatabase = await makeGenerationDatabase(db);
    const conversationDatabase = await makeConversationDatabase(db);
    const userId = "user-repair";
    const conversationId = await run(
      conversationDatabase.createConversation({ userId, title: "Lost reply" }),
    );
    const [userMessageId] = await run(
      conversationDatabase.saveConversationMessages({
        userId,
        conversationId,
        parentId: null,
        messages: [{ role: "user", parts: [{ type: "text", text: "Charges de demain ?" }] }],
      }),
    );

    await run(
      generationDatabase.createGeneration({
        userId,
        generationId: "generation-lost",
        conversationId,
        requestId: "request-lost",
        traceId: "trace-lost",
        model: "gpt-5",
      }),
    );
    await run(
      generationDatabase.markGenerationStreaming({ userId, generationId: "generation-lost" }),
    );
    await run(
      generationDatabase.appendGenerationChunks({
        userId,
        generationId: "generation-lost",
        chunks: [
          { sequence: 0, chunk: { type: "start" } },
          { sequence: 1, chunk: { type: "text-start", id: "message-1" } },
          { sequence: 2, chunk: { type: "text-delta", id: "message-1", delta: "Hello " } },
          {
            sequence: 3,
            chunk: {
              type: "tool-input-available",
              toolCallId: "tool-1",
              toolName: "get_goal_progress",
              input: {},
            },
          },
          { sequence: 4, chunk: { type: "text-delta", id: "message-1", delta: "world" } },
          {
            sequence: 5,
            chunk: { type: "tool-output-available", toolCallId: "tool-1", output: { ok: true } },
          },
          { sequence: 6, chunk: { type: "text-end", id: "message-1" } },
        ],
      }),
    );
    await run(
      generationDatabase.finishGeneration({
        userId,
        generationId: "generation-lost",
        status: "completed",
        finishReason: "stop",
      }),
    );

    assert.strictEqual(
      await run(
        ServerDatabase.repair.repairOrphanedMessages({
          generationDatabase,
          conversationDatabase,
          userId,
        }),
      ),
      1,
    );

    const messages = await run(
      conversationDatabase.getConversationMessages({ userId, conversationId }),
    );
    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[0].id, userMessageId);
    assert.strictEqual(messages[1].role, "assistant");
    assert.strictEqual(messages[1].parent_id, userMessageId);
    assert.strictEqual(messages[1].model, "gpt-5");
    assert.deepStrictEqual(JSON.parse(messages[1].parts), [
      {
        type: "tool-invocation",
        toolName: "get_goal_progress",
        toolCallId: "tool-1",
        state: "output-available",
        input: {},
        output: { ok: true },
      },
      { type: "text", text: "Hello world" },
    ]);

    assert.strictEqual(
      await run(
        ServerDatabase.repair.repairOrphanedMessages({
          generationDatabase,
          conversationDatabase,
          userId,
        }),
      ),
      0,
    );
    assert.strictEqual(
      (await run(conversationDatabase.getConversationMessages({ userId, conversationId }))).length,
      2,
    );

    const otherUser = "user-other";
    const otherConversationId = await run(
      conversationDatabase.createConversation({ userId: otherUser, title: "Other lost reply" }),
    );
    await run(
      generationDatabase.createGeneration({
        userId: otherUser,
        generationId: "generation-other-lost",
        conversationId: otherConversationId,
      }),
    );
    await run(
      generationDatabase.appendGenerationChunks({
        userId: otherUser,
        generationId: "generation-other-lost",
        chunks: [
          { sequence: 0, chunk: { type: "text-start", id: "message-2" } },
          { sequence: 1, chunk: { type: "text-delta", id: "message-2", delta: "private" } },
        ],
      }),
    );
    assert.strictEqual(
      await run(
        ServerDatabase.repair.repairOrphanedMessages({
          generationDatabase,
          conversationDatabase,
          userId,
        }),
      ),
      0,
    );
    assert.strictEqual(
      (
        await run(
          conversationDatabase.getConversationMessages({
            userId: otherUser,
            conversationId: otherConversationId,
          }),
        )
      ).length,
      0,
    );
  });
});
