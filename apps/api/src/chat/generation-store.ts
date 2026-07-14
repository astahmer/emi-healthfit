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

export const createGeneration = Effect.fn("chatGeneration.create")(function* ({
  db,
  generationId,
  conversationId,
}: {
  db: QueryDatabaseClient;
  generationId: string;
  conversationId: string;
}) {
  const timestamp = nowIso();
  yield* db
    .prepare(
      "INSERT INTO chat_generations (id, conversation_id, status, created_at, updated_at) VALUES (?, ?, 'running', ?, ?)",
    )
    .bind(generationId, conversationId, timestamp, timestamp)
    .run();
});

export const appendGenerationChunk = Effect.fn("chatGeneration.appendChunk")(function* ({
  db,
  generationId,
  sequence,
  chunk,
}: {
  db: QueryDatabaseClient;
  generationId: string;
  sequence: number;
  chunk: UIMessageChunk;
}) {
  const timestamp = nowIso();
  const insert = db
    .prepare(
      "INSERT INTO chat_generation_chunks (generation_id, sequence, chunk, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(generationId, sequence, JSON.stringify(chunk), timestamp);
  const update = db
    .prepare("UPDATE chat_generations SET updated_at = ? WHERE id = ?")
    .bind(timestamp, generationId);
  yield* db.batch([insert, update]);
});

export const finishGeneration = Effect.fn("chatGeneration.finish")(function* ({
  db,
  generationId,
  status,
  error,
}: {
  db: QueryDatabaseClient;
  generationId: string;
  status: "completed" | "failed";
  error?: string;
}) {
  yield* db
    .prepare("UPDATE chat_generations SET status = ?, error = ?, updated_at = ? WHERE id = ?")
    .bind(status, error ?? null, nowIso(), generationId)
    .run();
});

export const expireStaleGenerations = Effect.fn("chatGeneration.expireStale")(function* ({
  db,
}: {
  db: QueryDatabaseClient;
}) {
  const result = yield* db
    .prepare(
      "UPDATE chat_generations SET status = 'failed', error = 'Generation timed out', updated_at = ? WHERE status = 'running' AND datetime(updated_at) < datetime('now', '-10 minutes')",
    )
    .bind(nowIso())
    .run();
  return result.meta.changes;
});

export const cleanupGenerationHistory = Effect.fn("chatGeneration.cleanupHistory")(function* ({
  db,
  retentionDays = 7,
}: {
  db: QueryDatabaseClient;
  retentionDays?: number;
}) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000).toISOString();
  const result = yield* db
    .prepare(
      "DELETE FROM chat_generations WHERE status IN ('completed', 'failed') AND updated_at < ?",
    )
    .bind(cutoff)
    .run();
  return result.meta.changes;
});

export const getRunningGeneration = Effect.fn("chatGeneration.getRunning")(function* ({
  db,
  conversationId,
}: {
  db: QueryDatabaseClient;
  conversationId: string;
}) {
  const result = yield* db
    .prepare(
      "SELECT id, conversation_id, status, error, created_at, updated_at FROM chat_generations WHERE conversation_id = ? AND status = 'running' ORDER BY created_at DESC LIMIT 1",
    )
    .bind(conversationId)
    .first<ChatGeneration>();
  return result ?? null;
});

export const getResumableGeneration = Effect.fn("chatGeneration.getResumable")(function* ({
  db,
  conversationId,
}: {
  db: QueryDatabaseClient;
  conversationId: string;
}) {
  const result = yield* db
    .prepare(
      "SELECT id, conversation_id, status, error, created_at, updated_at FROM chat_generations WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(conversationId)
    .first<ChatGeneration>();
  if (result === null || result.status === "completed") return null;
  return result;
});

export const getGeneration = Effect.fn("chatGeneration.get")(function* ({
  db,
  generationId,
}: {
  db: QueryDatabaseClient;
  generationId: string;
}) {
  const result = yield* db
    .prepare(
      "SELECT id, conversation_id, status, error, created_at, updated_at FROM chat_generations WHERE id = ?",
    )
    .bind(generationId)
    .first<ChatGeneration>();
  return result ?? null;
});

export const getGenerationChunks = Effect.fn("chatGeneration.getChunks")(function* ({
  db,
  generationId,
  afterSequence,
}: {
  db: QueryDatabaseClient;
  generationId: string;
  afterSequence: number;
}) {
  const result = yield* db
    .prepare(
      "SELECT sequence, chunk FROM chat_generation_chunks WHERE generation_id = ? AND sequence > ? ORDER BY sequence ASC",
    )
    .bind(generationId, afterSequence)
    .all<ChatGenerationChunkRow>();
  return result.results.map((row) => ({
    sequence: row.sequence,
    chunk: JSON.parse(row.chunk) as UIMessageChunk,
  }));
});
