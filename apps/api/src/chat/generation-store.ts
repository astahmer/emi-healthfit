import * as Effect from "effect/Effect";
import type { UIMessageChunk } from "ai";
import type { QueryDatabaseClient } from "../db/operations.ts";

export interface ChatGeneration {
  id: string;
  conversation_id: string;
  status: "running" | "completed" | "failed";
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface ChatGenerationChunkRow {
  sequence: number;
  chunk: string;
}

const nowIso = (): string => new Date().toISOString();

export const isGenerationStale = (generation: ChatGeneration, now = Date.now()): boolean =>
  generation.status === "running" && now - new Date(generation.updated_at).getTime() >= 120_000;

export const createGeneration = Effect.fn("chatGeneration.create")(function* ({
  db,
  userId,
  generationId,
  conversationId,
}: {
  db: QueryDatabaseClient;
  userId: string;
  generationId: string;
  conversationId: string;
}) {
  const timestamp = nowIso();
  yield* db
    .prepare(
      "INSERT INTO chat_generations (id, user_id, conversation_id, status, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, ?)",
    )
    .bind(generationId, userId, conversationId, timestamp, timestamp)
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
}: {
  db: QueryDatabaseClient;
  userId: string;
  generationId: string;
  status: "completed" | "failed";
  error?: string;
}) {
  yield* db
    .prepare(
      "UPDATE chat_generations SET status = ?, error = ?, updated_at = ? WHERE user_id = ? AND id = ?",
    )
    .bind(status, error ?? null, nowIso(), userId, generationId)
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
      "UPDATE chat_generations SET status = 'failed', error = 'Generation timed out', updated_at = ? WHERE user_id = ? AND status = 'running' AND datetime(updated_at) < datetime('now', '-2 minutes')",
    )
    .bind(nowIso(), userId)
    .run();
  return result.meta.changes;
});

export const reconcileFinishedGenerations = Effect.fn("chatGeneration.reconcileFinished")(
  function* ({ db, userId }: { db: QueryDatabaseClient; userId: string }) {
    const result = yield* db
      .prepare(
        "UPDATE chat_generations SET status = 'completed', error = NULL, updated_at = ? WHERE user_id = ? AND status = 'running' AND EXISTS (SELECT 1 FROM chat_generation_chunks WHERE user_id = chat_generations.user_id AND generation_id = chat_generations.id AND json_extract(chunk, '$.type') = 'finish')",
      )
      .bind(nowIso(), userId)
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
      "DELETE FROM chat_generations WHERE user_id = ? AND status IN ('completed', 'failed') AND updated_at < ?",
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
      "SELECT id, conversation_id, status, error, created_at, updated_at FROM chat_generations WHERE user_id = ? AND conversation_id = ? AND status = 'running' ORDER BY created_at DESC LIMIT 1",
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
      "SELECT id, conversation_id, status, error, created_at, updated_at FROM chat_generations WHERE user_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(userId, conversationId)
    .first<ChatGeneration>();
  if (result === null || result.status === "completed") return null;
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
    .prepare(
      "SELECT id, conversation_id, status, error, created_at, updated_at FROM chat_generations WHERE user_id = ? AND id = ?",
    )
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
  return result.results.map((row) => ({
    sequence: row.sequence,
    chunk: JSON.parse(row.chunk) as UIMessageChunk,
  }));
});
