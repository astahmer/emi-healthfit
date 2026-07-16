import * as Effect from "effect/Effect";
import type { MemoryRow, NoteRow } from "./schema.ts";
import type { QueryDatabaseClient } from "./client.ts";

const nowIso = (): string => new Date().toISOString();

export const insertMemory = (
  db: QueryDatabaseClient,
  userId: string,
  content: string,
  source?: string,
  threadId?: string,
) =>
  Effect.gen(function* () {
    const trimmed = content.trim();
    if (trimmed === "") return null;

    const id = crypto.randomUUID();
    yield* db
      .prepare(`
      INSERT INTO memories (id, user_id, content, source, thread_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
      .bind(id, userId, trimmed, source ?? null, threadId ?? null, nowIso())
      .run();

    return id;
  });

export interface MemorySearchResult {
  id: string;
  content: string;
  source: string | null;
  thread_id: string | null;
  created_at: string;
  rank: number;
}

export const searchMemories = (
  db: QueryDatabaseClient,
  userId: string,
  query: string,
  limit = 10,
) =>
  Effect.gen(function* () {
    const term = query.trim();
    if (term === "") {
      const result = yield* db
        .prepare(`
        SELECT id, content, source, thread_id, created_at
        FROM memories
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
        .bind(userId, limit)
        .all<Omit<MemorySearchResult, "rank">>();
      return result.results.map((row) => ({ ...row, rank: 0 }));
    }

    const pattern = `%${term.toLowerCase()}%`;
    const result = yield* db
      .prepare(`
      SELECT id, content, source, thread_id, created_at,
        CASE
          WHEN LOWER(content) = ? THEN 3
          WHEN LOWER(content) LIKE ? THEN 2
          WHEN LOWER(content) LIKE ? THEN 1
          ELSE 0
        END as rank
      FROM memories
      WHERE user_id = ? AND LOWER(content) LIKE ?
      ORDER BY rank DESC, created_at DESC
      LIMIT ?
    `)
      .bind(term.toLowerCase(), `${term.toLowerCase()} %`, pattern, userId, pattern, limit)
      .all<MemorySearchResult>();

    return result.results;
  });

export const getMemories = (db: QueryDatabaseClient, userId: string, limit = 100) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT id, content, source, thread_id, created_at
      FROM memories
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `)
      .bind(userId, limit)
      .all<MemoryRow>();
    return result.results;
  });

export const deleteMemory = (db: QueryDatabaseClient, userId: string, id: string) =>
  Effect.gen(function* () {
    yield* db.prepare(`DELETE FROM memories WHERE user_id = ? AND id = ?`).bind(userId, id).run();
  });

export const insertNote = (db: QueryDatabaseClient, userId: string, content: string) =>
  Effect.gen(function* () {
    const trimmed = content.trim();
    if (trimmed === "") return null;

    const id = crypto.randomUUID();
    const createdAt = nowIso();
    yield* db
      .prepare(`
      INSERT INTO notes (id, user_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `)
      .bind(id, userId, trimmed, createdAt, createdAt)
      .run();

    return id;
  });

export const updateNote = (db: QueryDatabaseClient, userId: string, id: string, content: string) =>
  Effect.gen(function* () {
    const trimmed = content.trim();
    if (trimmed === "") return;

    yield* db
      .prepare(`
      UPDATE notes SET content = ?, updated_at = ? WHERE user_id = ? AND id = ?
    `)
      .bind(trimmed, nowIso(), userId, id)
      .run();
  });

export const deleteNote = (db: QueryDatabaseClient, userId: string, id: string) =>
  Effect.gen(function* () {
    yield* db.prepare(`DELETE FROM notes WHERE user_id = ? AND id = ?`).bind(userId, id).run();
  });

export const getNotes = (db: QueryDatabaseClient, userId: string, limit = 100) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT id, content, created_at, updated_at
      FROM notes
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `)
      .bind(userId, limit)
      .all<NoteRow>();
    return result.results;
  });

export const searchNotes = (db: QueryDatabaseClient, userId: string, query: string, limit = 10) =>
  Effect.gen(function* () {
    const term = query.trim();
    if (term === "") return yield* getNotes(db, userId, limit);

    const pattern = `%${term.toLowerCase()}%`;
    const result = yield* db
      .prepare(`
      SELECT id, content, created_at, updated_at
      FROM notes
      WHERE user_id = ? AND LOWER(content) LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `)
      .bind(userId, pattern, limit)
      .all<NoteRow>();
    return result.results;
  });
