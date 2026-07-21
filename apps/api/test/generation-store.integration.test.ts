import assert from "node:assert";
import { describe, it } from "node:test";
import {
  appendGenerationChunk,
  cancelRunningGenerations,
  cleanupGenerationHistory,
  createGeneration,
  expireStaleGenerations,
  finishGeneration,
  getGeneration,
  getGenerationChunks,
  getResumableGeneration,
  getRunningGeneration,
  markGenerationStreaming,
  reconcileFinishedGenerations,
  recordChatEvent,
  updateGenerationMetadata,
} from "../src/core/chat/generation-store.ts";
import type { ConversationDatabaseSchema } from "@emi/core/server";
import { createConversation } from "../src/core/db/conversations.ts";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";

describe("generation store SQLite integration", () => {
  it("persists streaming lifecycle, ordered chunks, events, reconciliation, expiry, and cleanup", async () => {
    const { db, sqlite } = makeSqliteDatabase();
    const userId = "user-a";
    const conversationId = await run(
      createConversation(
        narrowQueryDatabaseClient<ConversationDatabaseSchema>(db),
        userId,
        "Streaming",
      ),
    );

    await run(
      createGeneration({
        db,
        userId,
        generationId: "generation-a",
        conversationId,
        requestId: "request-a",
        traceId: "trace-a",
        model: "gpt-5",
      }),
    );
    assert.strictEqual(
      (await run(getGeneration({ db, userId, generationId: "generation-a" })))?.status,
      "pending",
    );
    await run(markGenerationStreaming({ db, userId, generationId: "generation-a" }));
    await run(
      updateGenerationMetadata({
        db,
        userId,
        generationId: "generation-a",
        finishReason: "stop",
        inputTokens: 10,
        outputTokens: 20,
      }),
    );
    await run(
      appendGenerationChunk({
        db,
        userId,
        generationId: "generation-a",
        sequence: 0,
        chunk: { type: "start" },
      }),
    );
    await run(
      appendGenerationChunk({
        db,
        userId,
        generationId: "generation-a",
        sequence: 1,
        chunk: { type: "finish" },
      }),
    );
    await run(
      recordChatEvent({
        db,
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
        getGenerationChunks({ db, userId, generationId: "generation-a", afterSequence: 0 }),
      ),
      [{ sequence: 1, chunk: { type: "finish" } }],
    );
    assert.strictEqual(
      (await run(getRunningGeneration({ db, userId, conversationId })))?.id,
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
      finishGeneration({
        db,
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
        status: (await run(getGeneration({ db, userId, generationId: "generation-a" })))?.status,
        input: (await run(getGeneration({ db, userId, generationId: "generation-a" })))
          ?.input_tokens,
        output: (await run(getGeneration({ db, userId, generationId: "generation-a" })))
          ?.output_tokens,
      },
      { status: "completed", input: 11, output: 21 },
    );
    assert.strictEqual(await run(getResumableGeneration({ db, userId, conversationId })), null);

    await run(
      createGeneration({
        db,
        userId,
        generationId: "generation-b",
        conversationId,
      }),
    );
    await run(
      appendGenerationChunk({
        db,
        userId,
        generationId: "generation-b",
        sequence: 0,
        chunk: { type: "finish" },
      }),
    );
    assert.strictEqual(await run(reconcileFinishedGenerations({ db, userId })), 1);
    assert.strictEqual(
      (await run(getGeneration({ db, userId, generationId: "generation-b" })))?.status,
      "completed",
    );

    await run(
      createGeneration({
        db,
        userId,
        generationId: "generation-c",
        conversationId,
      }),
    );
    await run(markGenerationStreaming({ db, userId, generationId: "generation-c" }));
    sqlite
      .prepare("UPDATE chat_generations SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = ?")
      .run("generation-c");
    assert.strictEqual(await run(expireStaleGenerations({ db, userId })), 1);
    assert.deepStrictEqual(
      {
        status: (await run(getGeneration({ db, userId, generationId: "generation-c" })))?.status,
        error: (await run(getGeneration({ db, userId, generationId: "generation-c" })))?.error,
      },
      { status: "timed_out", error: "Generation timed out" },
    );
    assert.strictEqual(
      (await run(getResumableGeneration({ db, userId, conversationId })))?.id,
      "generation-c",
    );

    await run(
      createGeneration({
        db,
        userId,
        generationId: "generation-d",
        conversationId,
      }),
    );
    await run(
      finishGeneration({
        db,
        userId,
        generationId: "generation-d",
        status: "failed",
        error: "Provider unavailable",
      }),
    );
    sqlite
      .prepare("UPDATE chat_generations SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = ?")
      .run("generation-d");
    assert.strictEqual(await run(cleanupGenerationHistory({ db, userId, retentionDays: 7 })), 1);
    assert.strictEqual(
      await run(getGeneration({ db, userId, generationId: "generation-d" })),
      null,
    );
  });

  it("cancels running generations for a conversation without touching finished ones", async () => {
    const { db } = makeSqliteDatabase();
    const userId = "user-cancel";
    const conversationId = await run(
      createConversation(
        narrowQueryDatabaseClient<ConversationDatabaseSchema>(db),
        userId,
        "Cancel running",
      ),
    );

    await run(
      createGeneration({
        db,
        userId,
        generationId: "running-a",
        conversationId,
      }),
    );
    await run(markGenerationStreaming({ db, userId, generationId: "running-a" }));

    assert.strictEqual(
      await run(
        cancelRunningGenerations({
          db,
          userId,
          conversationId,
          reason: "superseded",
          error: "Superseded by a newer request",
        }),
      ),
      1,
    );
    assert.strictEqual(
      (await run(getGeneration({ db, userId, generationId: "running-a" })))?.status,
      "cancelled",
    );
    assert.strictEqual(await run(getRunningGeneration({ db, userId, conversationId })), null);

    await run(
      createGeneration({
        db,
        userId,
        generationId: "next-c",
        conversationId,
      }),
    );
    await run(
      finishGeneration({
        db,
        userId,
        generationId: "next-c",
        status: "completed",
        finishReason: "stop",
      }),
    );
    assert.strictEqual(
      (await run(getGeneration({ db, userId, generationId: "next-c" })))?.status,
      "completed",
    );
    assert.strictEqual(
      await run(
        cancelRunningGenerations({
          db,
          userId,
          conversationId,
          reason: "superseded",
        }),
      ),
      0,
    );
  });

  it("ignores late finishGeneration after a generation was cancelled", async () => {
    const { db } = makeSqliteDatabase();
    const userId = "user-late-finish";
    const conversationId = await run(
      createConversation(
        narrowQueryDatabaseClient<ConversationDatabaseSchema>(db),
        userId,
        "Late finish",
      ),
    );

    await run(
      createGeneration({
        db,
        userId,
        generationId: "cancelled-a",
        conversationId,
      }),
    );
    await run(markGenerationStreaming({ db, userId, generationId: "cancelled-a" }));
    assert.strictEqual(
      await run(
        finishGeneration({
          db,
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
        finishGeneration({
          db,
          userId,
          generationId: "cancelled-a",
          status: "completed",
          finishReason: "stop",
        }),
      ),
      false,
    );
    assert.strictEqual(
      (await run(getGeneration({ db, userId, generationId: "cancelled-a" })))?.status,
      "cancelled",
    );
  });
});
