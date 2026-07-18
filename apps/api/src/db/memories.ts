import * as Effect from "effect/Effect";
import type { MemoryRow, NoteRow } from "./schema.ts";
import { runTransaction, type QueryDatabaseClient } from "./client.ts";

const nowIso = (): string => new Date().toISOString();

const normalizeContent = (content: string): string => content.trim().replace(/\s+/g, " ");

const normalizeMemoryKey = (content: string): string =>
  normalizeContent(content).toLocaleLowerCase();

export interface MemoryInput {
  content: string;
  source?: string;
  threadId?: string;
  messageId?: string;
}

const persistedSource = ({ source, messageId }: MemoryInput): string | null =>
  messageId === undefined ? (source ?? null) : `${source ?? "manual"}:${messageId}`;

export const insertMemories = (db: QueryDatabaseClient, userId: string, inputs: MemoryInput[]) =>
  Effect.gen(function* () {
    const unique = new Map<string, MemoryInput>();
    for (const input of inputs) {
      const content = normalizeContent(input.content);
      if (content !== "") unique.set(normalizeMemoryKey(content), { ...input, content });
    }
    const candidates = [...unique.values()];
    if (candidates.length === 0) return [];

    const placeholders = candidates.map(() => "?").join(", ");
    const existing = yield* db
      .prepare(`
        SELECT LOWER(TRIM(content)) AS normalized
        FROM memories
        WHERE user_id = ? AND LOWER(TRIM(content)) IN (${placeholders})
      `)
      .bind(userId, ...candidates.map((candidate) => normalizeMemoryKey(candidate.content)))
      .all<{ normalized: string }>();
    const existingKeys = new Set(existing.results.map((row) => row.normalized));
    const createdAt = nowIso();
    const inserted = candidates
      .filter((candidate) => !existingKeys.has(normalizeMemoryKey(candidate.content)))
      .map((candidate) => ({ id: crypto.randomUUID(), ...candidate }));
    yield* runTransaction(
      db,
      inserted.map((memory) =>
        db
          .prepare(`
            INSERT INTO memories (id, user_id, content, source, thread_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .bind(
            memory.id,
            userId,
            memory.content,
            persistedSource(memory),
            memory.threadId ?? null,
            createdAt,
          ),
      ),
    );
    return inserted.map((memory) => memory.id);
  });

export const insertMemory = (
  db: QueryDatabaseClient,
  userId: string,
  content: string,
  source?: string,
  threadId?: string,
  messageId?: string,
) =>
  insertMemories(db, userId, [{ content, source, threadId, messageId }]).pipe(
    Effect.map((ids) => ids[0] ?? null),
  );

export interface MemorySearchResult {
  id: string;
  content: string;
  source: string | null;
  thread_id: string | null;
  created_at: string;
  rank: number;
}

type MemorySearchRow = Omit<MemorySearchResult, "rank"> & { rank?: number };

const toMemorySearchResult = (row: MemorySearchRow): MemorySearchResult => ({
  id: row.id,
  content: row.content,
  source: row.source,
  thread_id: row.thread_id,
  created_at: row.created_at,
  rank: row.rank ?? 0,
});

export const searchMemories = (
  db: QueryDatabaseClient,
  userId: string,
  query: string,
  options: { limit?: number } = {},
) =>
  Effect.gen(function* () {
    const limit = options.limit ?? 10;
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
        .all<MemorySearchRow>();
      return result.results.map(toMemorySearchResult);
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
      .all<MemorySearchRow>();

    return result.results.map(toMemorySearchResult);
  });

export const getMemories = (
  db: QueryDatabaseClient,
  userId: string,
  options: { limit?: number } = {},
) =>
  Effect.gen(function* () {
    const limit = options.limit ?? 100;
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

export const listMemoryIdsForMessage = (
  db: QueryDatabaseClient,
  userId: string,
  messageId: string,
) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare("SELECT id FROM memories WHERE user_id = ? AND source LIKE ?")
      .bind(userId, `%:${messageId}`)
      .all<{ id: string }>();
    return result.results.map((row) => row.id);
  });

export const deleteMemory = (db: QueryDatabaseClient, userId: string, id: string) =>
  Effect.gen(function* () {
    yield* db.prepare(`DELETE FROM memories WHERE user_id = ? AND id = ?`).bind(userId, id).run();
  });

export const deleteMemoriesByMessage = (
  db: QueryDatabaseClient,
  userId: string,
  messageId: string,
) =>
  Effect.gen(function* () {
    yield* db
      .prepare("DELETE FROM memories WHERE user_id = ? AND source LIKE ?")
      .bind(userId, `%:${messageId}`)
      .run();
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
