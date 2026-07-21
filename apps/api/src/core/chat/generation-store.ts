import { uiMessageChunkSchema, type UIMessageChunk } from "ai";
import * as Effect from "effect/Effect";
import type { ConversationDatabaseSchema } from "@emi/core/server";
import {
  narrowQueryDatabaseClient,
  runTransaction,
  type QueryDatabaseClient,
} from "../../platform/db/client.ts";
import { getConversation } from "../db/conversations.ts";
import { decodeJson } from "../lib/json-codec.ts";

export interface ChatGeneration {
  id: string;
  conversation_id: string;
  request_id: string;
  trace_id: string;
  status: "pending" | "streaming" | "completed" | "failed" | "timed_out" | "cancelled";
  error: string | null;
  finish_reason: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  retry_count: number;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ChatGenerationChunkRow {
  sequence: number;
  chunk: string;
}

const nowIso = (): string => new Date().toISOString();
const generationStaleMilliseconds = 5 * 60 * 1_000;

export const decodeGenerationChunk = async (value: string): Promise<UIMessageChunk> => {
  const parsed = decodeJson(value);
  const validate = uiMessageChunkSchema().validate;
  if (validate === undefined) throw new Error("UI message chunk validator is unavailable");
  const result = await validate(parsed);
  if (!result.success) throw result.error;
  return result.value;
};

export const isGenerationStale = (generation: ChatGeneration, now = Date.now()): boolean =>
  (generation.status === "pending" || generation.status === "streaming") &&
  now - new Date(generation.updated_at).getTime() >= generationStaleMilliseconds;

export const createGeneration = Effect.fn("chatGeneration.create")(function* ({
  db,
  userId,
  generationId,
  conversationId,
  requestId = generationId,
  traceId = requestId,
  model,
}: {
  db: QueryDatabaseClient;
  userId: string;
  generationId: string;
  conversationId: string;
  requestId?: string;
  traceId?: string;
  model?: string;
}) {
  const conversation = yield* getConversation(
    narrowQueryDatabaseClient<ConversationDatabaseSchema>(db),
    userId,
    conversationId,
  );
  if (conversation === null) return false;

  const kysely = yield* db.kysely;
  const timestamp = nowIso();
  yield* Effect.promise(() =>
    kysely
      .insertInto("chat_generations")
      .values({
        conversation_id: conversationId,
        created_at: timestamp,
        id: generationId,
        model: model ?? null,
        request_id: requestId,
        started_at: timestamp,
        status: "pending",
        trace_id: traceId,
        updated_at: timestamp,
        user_id: userId,
      })
      .execute(),
  );
  return true;
});

export const markGenerationStreaming = Effect.fn("chatGeneration.markStreaming")(function* ({
  db,
  userId,
  generationId,
}: {
  db: QueryDatabaseClient;
  userId: string;
  generationId: string;
}) {
  const kysely = yield* db.kysely;
  yield* Effect.promise(() =>
    kysely
      .updateTable("chat_generations")
      .set({ status: "streaming", updated_at: nowIso() })
      .where("user_id", "=", userId)
      .where("id", "=", generationId)
      .where("status", "=", "pending")
      .execute(),
  );
});

export const updateGenerationMetadata = Effect.fn("chatGeneration.updateMetadata")(function* ({
  db,
  userId,
  generationId,
  finishReason,
  inputTokens,
  outputTokens,
}: {
  db: QueryDatabaseClient;
  userId: string;
  generationId: string;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const kysely = yield* db.kysely;
  yield* Effect.promise(() =>
    kysely
      .updateTable("chat_generations")
      .set({
        finish_reason: finishReason,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        updated_at: nowIso(),
      })
      .where("user_id", "=", userId)
      .where("id", "=", generationId)
      .execute(),
  );
});

export const appendGenerationChunk = Effect.fn("chatGeneration.appendChunk")(function* ({
  db,
  userId,
  generationId,
  sequence,
  chunk,
}: {
  db: QueryDatabaseClient;
  userId: string;
  generationId: string;
  sequence: number;
  chunk: UIMessageChunk;
}) {
  const generation = yield* getGeneration({ db, userId, generationId });
  if (generation === null) return false;

  const kysely = yield* db.kysely;
  const timestamp = nowIso();
  yield* runTransaction(db, [
    kysely.insertInto("chat_generation_chunks").values({
      chunk: JSON.stringify(chunk),
      created_at: timestamp,
      generation_id: generationId,
      sequence,
      user_id: userId,
    }),
    kysely
      .updateTable("chat_generations")
      .set({ updated_at: timestamp })
      .where("user_id", "=", userId)
      .where("id", "=", generationId),
  ]);
  return true;
});

export const finishGeneration = Effect.fn("chatGeneration.finish")(function* ({
  db,
  userId,
  generationId,
  status,
  error,
  finishReason,
  inputTokens,
  outputTokens,
}: {
  db: QueryDatabaseClient;
  userId: string;
  generationId: string;
  status: "completed" | "failed" | "timed_out" | "cancelled";
  error?: string;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
}) {
  const kysely = yield* db.kysely;
  const timestamp = nowIso();
  const result = yield* Effect.promise(() =>
    kysely
      .updateTable("chat_generations")
      .set({
        error: error ?? null,
        ...(finishReason === undefined ? {} : { finish_reason: finishReason }),
        finished_at: timestamp,
        ...(inputTokens === undefined ? {} : { input_tokens: inputTokens }),
        ...(outputTokens === undefined ? {} : { output_tokens: outputTokens }),
        status,
        updated_at: timestamp,
      })
      .where("user_id", "=", userId)
      .where("id", "=", generationId)
      .where("status", "in", ["pending", "streaming"])
      .executeTakeFirst(),
  );
  return Number(result.numUpdatedRows) > 0;
});

export const cancelRunningGenerations = Effect.fn("chatGeneration.cancelRunning")(function* ({
  db,
  userId,
  conversationId,
  reason,
  error,
}: {
  db: QueryDatabaseClient;
  userId: string;
  conversationId: string;
  reason: string;
  error?: string;
}) {
  const kysely = yield* db.kysely;
  const timestamp = nowIso();
  const result = yield* Effect.promise(() =>
    kysely
      .updateTable("chat_generations")
      .set({
        error: error ?? null,
        finish_reason: reason,
        finished_at: timestamp,
        status: "cancelled",
        updated_at: timestamp,
      })
      .where("user_id", "=", userId)
      .where("conversation_id", "=", conversationId)
      .where("status", "in", ["pending", "streaming"])
      .executeTakeFirst(),
  );
  return Number(result.numUpdatedRows);
});

export const recordChatEvent = Effect.fn("chatEvent.record")(function* ({
  db,
  userId,
  conversationId,
  generationId,
  requestId,
  traceId,
  type,
  payload = {},
}: {
  db: QueryDatabaseClient;
  userId: string;
  conversationId: string;
  generationId: string;
  requestId: string;
  traceId: string;
  type: string;
  payload?: Record<string, unknown>;
}) {
  const kysely = yield* db.kysely;
  yield* Effect.promise(() =>
    kysely
      .insertInto("chat_events")
      .values({
        conversation_id: conversationId,
        created_at: nowIso(),
        generation_id: generationId,
        id: crypto.randomUUID(),
        payload: JSON.stringify(payload),
        request_id: requestId,
        schema_version: 1,
        trace_id: traceId,
        type,
        user_id: userId,
      })
      .execute(),
  );
});

export const expireStaleGenerations = Effect.fn("chatGeneration.expireStale")(function* ({
  db,
  userId,
}: {
  db: QueryDatabaseClient;
  userId: string;
}) {
  const kysely = yield* db.kysely;
  const timestamp = nowIso();
  const result = yield* Effect.promise(() =>
    kysely
      .updateTable("chat_generations")
      .set({
        error: "Generation timed out",
        finish_reason: "timeout",
        finished_at: timestamp,
        status: "timed_out",
        updated_at: timestamp,
      })
      .where("user_id", "=", userId)
      .where("status", "in", ["pending", "streaming"])
      .where("updated_at", "<", new Date(Date.now() - generationStaleMilliseconds).toISOString())
      .executeTakeFirst(),
  );
  return Number(result.numUpdatedRows);
});

export const reconcileFinishedGenerations = Effect.fn("chatGeneration.reconcileFinished")(
  function* ({ db, userId }: { db: QueryDatabaseClient; userId: string }) {
    const kysely = yield* db.kysely;
    const timestamp = nowIso();
    const result = yield* Effect.promise(() =>
      kysely
        .updateTable("chat_generations")
        .set({
          error: null,
          finish_reason: "stop",
          finished_at: timestamp,
          status: "completed",
          updated_at: timestamp,
        })
        .where("user_id", "=", userId)
        .where("status", "in", ["pending", "streaming"])
        .where((expressionBuilder) =>
          expressionBuilder.exists(
            expressionBuilder
              .selectFrom("chat_generation_chunks")
              .select("sequence")
              .whereRef("chat_generation_chunks.user_id", "=", "chat_generations.user_id")
              .whereRef("generation_id", "=", "chat_generations.id")
              .where((chunkExpressionBuilder) =>
                chunkExpressionBuilder(
                  chunkExpressionBuilder.fn<string>("json_extract", [
                    "chunk",
                    chunkExpressionBuilder.val("$.type"),
                  ]),
                  "=",
                  "finish",
                ),
              ),
          ),
        )
        .executeTakeFirst(),
    );
    return Number(result.numUpdatedRows);
  },
);

export const cleanupGenerationHistory = Effect.fn("chatGeneration.cleanupHistory")(function* ({
  db,
  userId,
  retentionDays = 7,
}: {
  db: QueryDatabaseClient;
  userId: string;
  retentionDays?: number;
}) {
  const kysely = yield* db.kysely;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000).toISOString();
  const result = yield* Effect.promise(() =>
    kysely
      .deleteFrom("chat_generations")
      .where("user_id", "=", userId)
      .where("status", "not in", ["pending", "streaming"])
      .where("updated_at", "<", cutoff)
      .executeTakeFirst(),
  );
  return Number(result.numDeletedRows);
});

export const getRunningGeneration = Effect.fn("chatGeneration.getRunning")(function* ({
  db,
  userId,
  conversationId,
}: {
  db: QueryDatabaseClient;
  userId: string;
  conversationId: string;
}) {
  const kysely = yield* db.kysely;
  const result = yield* Effect.promise(() =>
    kysely
      .selectFrom("chat_generations")
      .selectAll()
      .where("user_id", "=", userId)
      .where("conversation_id", "=", conversationId)
      .where("status", "in", ["pending", "streaming"])
      .orderBy("created_at", "desc")
      .executeTakeFirst(),
  );
  return result ?? null;
});

export const getResumableGeneration = Effect.fn("chatGeneration.getResumable")(function* ({
  db,
  userId,
  conversationId,
}: {
  db: QueryDatabaseClient;
  userId: string;
  conversationId: string;
}) {
  const kysely = yield* db.kysely;
  const result = yield* Effect.promise(() =>
    kysely
      .selectFrom("chat_generations")
      .selectAll()
      .where("user_id", "=", userId)
      .where("conversation_id", "=", conversationId)
      .orderBy("created_at", "desc")
      .executeTakeFirst(),
  );
  if (result === undefined || result.status === "completed" || result.status === "cancelled")
    return null;
  return result;
});

export const getGeneration = Effect.fn("chatGeneration.get")(function* ({
  db,
  userId,
  generationId,
}: {
  db: QueryDatabaseClient;
  userId: string;
  generationId: string;
}) {
  const kysely = yield* db.kysely;
  const result = yield* Effect.promise(() =>
    kysely
      .selectFrom("chat_generations")
      .selectAll()
      .where("user_id", "=", userId)
      .where("id", "=", generationId)
      .executeTakeFirst(),
  );
  return result ?? null;
});

export const getGenerationChunks = Effect.fn("chatGeneration.getChunks")(function* ({
  db,
  userId,
  generationId,
  afterSequence,
}: {
  db: QueryDatabaseClient;
  userId: string;
  generationId: string;
  afterSequence: number;
}) {
  const kysely = yield* db.kysely;
  const result = yield* Effect.promise(() =>
    kysely
      .selectFrom("chat_generation_chunks")
      .select(["sequence", "chunk"])
      .where("user_id", "=", userId)
      .where("generation_id", "=", generationId)
      .where("sequence", ">", afterSequence)
      .orderBy("sequence", "asc")
      .execute(),
  );
  return yield* Effect.forEach(result satisfies ChatGenerationChunkRow[], (row) =>
    Effect.promise(async () => ({
      sequence: row.sequence,
      chunk: await decodeGenerationChunk(row.chunk),
    })),
  );
});
