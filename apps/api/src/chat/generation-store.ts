import * as Effect from "effect/Effect";
import { uiMessageChunkSchema, type UIMessageChunk } from "ai";
import type { QueryDatabaseClient } from "../db/client.ts";

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
const generationStaleSqlModifier = "-5 minutes";

export const decodeGenerationChunk = async (value: string): Promise<UIMessageChunk> => {
  const parsed: unknown = JSON.parse(value);
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
  const timestamp = nowIso();
  yield* db
    .prepare(
      "INSERT INTO chat_generations (id, user_id, conversation_id, request_id, trace_id, status, model, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)",
    )
    .bind(
      generationId,
      userId,
      conversationId,
      requestId,
      traceId,
      model ?? null,
      timestamp,
      timestamp,
      timestamp,
    )
    .run();
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
  yield* db
    .prepare(
      "UPDATE chat_generations SET status = 'streaming', updated_at = ? WHERE user_id = ? AND id = ? AND status = 'pending'",
    )
    .bind(nowIso(), userId, generationId)
    .run();
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
  yield* db
    .prepare(
      "UPDATE chat_generations SET finish_reason = ?, input_tokens = ?, output_tokens = ?, updated_at = ? WHERE user_id = ? AND id = ?",
    )
    .bind(finishReason, inputTokens, outputTokens, nowIso(), userId, generationId)
    .run();
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
  const timestamp = nowIso();
  const insert = db
    .prepare(
      "INSERT INTO chat_generation_chunks (user_id, generation_id, sequence, chunk, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(userId, generationId, sequence, JSON.stringify(chunk), timestamp);
  const update = db
    .prepare("UPDATE chat_generations SET updated_at = ? WHERE user_id = ? AND id = ?")
    .bind(timestamp, userId, generationId);
  yield* db.batch([insert, update]);
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
  const timestamp = nowIso();
  yield* db
    .prepare(
      "UPDATE chat_generations SET status = ?, error = ?, finish_reason = COALESCE(?, finish_reason), input_tokens = COALESCE(?, input_tokens), output_tokens = COALESCE(?, output_tokens), finished_at = ?, updated_at = ? WHERE user_id = ? AND id = ?",
    )
    .bind(
      status,
      error ?? null,
      finishReason ?? null,
      inputTokens ?? null,
      outputTokens ?? null,
      timestamp,
      timestamp,
      userId,
      generationId,
    )
    .run();
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
  yield* db
    .prepare(
      "INSERT INTO chat_events (id, user_id, conversation_id, generation_id, request_id, trace_id, type, schema_version, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      userId,
      conversationId,
      generationId,
      requestId,
      traceId,
      type,
      JSON.stringify(payload),
      nowIso(),
    )
    .run();
});

export const expireStaleGenerations = Effect.fn("chatGeneration.expireStale")(function* ({
  db,
  userId,
}: {
  db: QueryDatabaseClient;
  userId: string;
}) {
  const result = yield* db
    .prepare(
      "UPDATE chat_generations SET status = 'timed_out', error = 'Generation timed out', finish_reason = 'timeout', finished_at = ?, updated_at = ? WHERE user_id = ? AND status IN ('pending', 'streaming') AND datetime(updated_at) < datetime('now', ?)",
    )
    .bind(nowIso(), nowIso(), userId, generationStaleSqlModifier)
    .run();
  return result.meta.changes;
});

export const reconcileFinishedGenerations = Effect.fn("chatGeneration.reconcileFinished")(
  function* ({ db, userId }: { db: QueryDatabaseClient; userId: string }) {
    const result = yield* db
      .prepare(
        "UPDATE chat_generations SET status = 'completed', error = NULL, finish_reason = COALESCE(finish_reason, 'stop'), finished_at = ?, updated_at = ? WHERE user_id = ? AND status IN ('pending', 'streaming') AND EXISTS (SELECT 1 FROM chat_generation_chunks WHERE user_id = chat_generations.user_id AND generation_id = chat_generations.id AND json_extract(chunk, '$.type') = 'finish')",
      )
      .bind(nowIso(), nowIso(), userId)
      .run();
    return result.meta.changes;
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
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000).toISOString();
  const result = yield* db
    .prepare(
      "DELETE FROM chat_generations WHERE user_id = ? AND status NOT IN ('pending', 'streaming') AND updated_at < ?",
    )
    .bind(userId, cutoff)
    .run();
  return result.meta.changes;
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
  const result = yield* db
    .prepare(
      "SELECT * FROM chat_generations WHERE user_id = ? AND conversation_id = ? AND status IN ('pending', 'streaming') ORDER BY created_at DESC LIMIT 1",
    )
    .bind(userId, conversationId)
    .first<ChatGeneration>();
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
  const result = yield* db
    .prepare(
      "SELECT * FROM chat_generations WHERE user_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(userId, conversationId)
    .first<ChatGeneration>();
  if (result === null || result.status === "completed" || result.status === "cancelled")
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
  const result = yield* db
    .prepare("SELECT * FROM chat_generations WHERE user_id = ? AND id = ?")
    .bind(userId, generationId)
    .first<ChatGeneration>();
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
  const result = yield* db
    .prepare(
      "SELECT sequence, chunk FROM chat_generation_chunks WHERE user_id = ? AND generation_id = ? AND sequence > ? ORDER BY sequence ASC",
    )
    .bind(userId, generationId, afterSequence)
    .all<ChatGenerationChunkRow>();
  return yield* Effect.forEach(result.results, (row) =>
    Effect.promise(async () => ({
      sequence: row.sequence,
      chunk: await decodeGenerationChunk(row.chunk),
    })),
  );
});
