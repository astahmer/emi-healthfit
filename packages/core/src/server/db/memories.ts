import * as Effect from "effect/Effect";
import { QueryDatabase, type QueryDatabaseClient } from "./query-database.ts";
import type { MemoryDatabaseSchema } from "./schema.ts";

type MemoriesDb<Environment = never> = QueryDatabaseClient<MemoryDatabaseSchema, Environment>;

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

export const insertMemories = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  inputs: MemoryInput[],
) =>
  Effect.gen(function* () {
    const unique = new Map<string, MemoryInput>();
    for (const input of inputs) {
      const content = normalizeContent(input.content);
      if (content !== "") unique.set(normalizeMemoryKey(content), { ...input, content });
    }
    const candidates = [...unique.values()];
    if (candidates.length === 0) return [];

    const kysely = yield* db.kysely;
    const existing = yield* Effect.promise(() =>
      kysely.selectFrom("memories").select("content").where("user_id", "=", userId).execute(),
    );
    const existingKeys = new Set(existing.map((memory) => normalizeMemoryKey(memory.content)));
    const createdAt = nowIso();
    const inserted = candidates
      .filter((candidate) => !existingKeys.has(normalizeMemoryKey(candidate.content)))
      .map((candidate) => ({ id: crypto.randomUUID(), ...candidate }));
    if (inserted.length === 0) return [];
    yield* QueryDatabase.transaction(db, [
      ...inserted.map((memory) =>
        kysely.insertInto("memories").values({
          content: memory.content,
          created_at: createdAt,
          id: memory.id,
          source: persistedSource(memory),
          thread_id: memory.threadId ?? null,
          user_id: userId,
        }),
      ),
      kysely.deleteFrom("memory_summaries").where("user_id", "=", userId),
    ]);
    return inserted.map((memory) => memory.id);
  });

export const insertMemory = <Environment>(
  db: MemoriesDb<Environment>,
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

export interface MemorySummary {
  content: string;
  memory_count: number;
  updated_at: string;
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

export const searchMemories = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  query: string,
  options: { limit?: number } = {},
) =>
  Effect.gen(function* () {
    const limit = options.limit ?? 10;
    const term = query.trim();
    const kysely = yield* db.kysely;
    if (term === "") {
      const result = yield* Effect.promise(() =>
        kysely
          .selectFrom("memories")
          .select(["id", "content", "source", "thread_id", "created_at"])
          .where("user_id", "=", userId)
          .orderBy("created_at", "desc")
          .limit(limit)
          .execute(),
      );
      return result.map(toMemorySearchResult);
    }

    const lowerTerm = term.toLowerCase();
    const result = yield* Effect.promise(() =>
      kysely
        .selectFrom("memories")
        .select((expressionBuilder) => [
          "id",
          "content",
          "source",
          "thread_id",
          "created_at",
          expressionBuilder
            .case()
            .when(expressionBuilder.fn<string>("lower", ["content"]), "=", lowerTerm)
            .then(3)
            .when(expressionBuilder.fn<string>("lower", ["content"]), "like", `${lowerTerm} %`)
            .then(2)
            .when(expressionBuilder.fn<string>("lower", ["content"]), "like", `%${lowerTerm}%`)
            .then(1)
            .else(0)
            .end()
            .as("rank"),
        ])
        .where("user_id", "=", userId)
        .where((expressionBuilder) =>
          expressionBuilder(
            expressionBuilder.fn<string>("lower", ["content"]),
            "like",
            `%${lowerTerm}%`,
          ),
        )
        .orderBy("rank", "desc")
        .orderBy("created_at", "desc")
        .limit(limit)
        .execute(),
    );

    return result.map(toMemorySearchResult);
  });

export const getMemories = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  options: { limit?: number } = {},
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    return yield* Effect.promise(() =>
      kysely
        .selectFrom("memories")
        .select(["id", "content", "source", "thread_id", "created_at"])
        .where("user_id", "=", userId)
        .orderBy("created_at", "desc")
        .limit(options.limit ?? 100)
        .execute(),
    );
  });

export const getMemorySummary = <Environment>(db: MemoriesDb<Environment>, userId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    return yield* Effect.promise(() =>
      kysely
        .selectFrom("memory_summaries")
        .select(["content", "memory_count", "updated_at"])
        .where("user_id", "=", userId)
        .executeTakeFirst(),
    );
  });

export const upsertMemorySummary = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  content: string,
  memoryCount: number,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const updatedAt = nowIso();
    yield* Effect.promise(() =>
      kysely
        .insertInto("memory_summaries")
        .values({
          user_id: userId,
          content,
          memory_count: memoryCount,
          updated_at: updatedAt,
        })
        .onConflict((conflict) =>
          conflict.column("user_id").doUpdateSet({
            content,
            memory_count: memoryCount,
            updated_at: updatedAt,
          }),
        )
        .execute(),
    );
  });

export const listMemoryIdsForMessage = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  messageId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* Effect.promise(() =>
      kysely
        .selectFrom("memories")
        .select("id")
        .where("user_id", "=", userId)
        .where("source", "like", `%:${messageId}`)
        .execute(),
    );
    return result.map((row) => row.id);
  });

export const deleteMemory = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  id: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* QueryDatabase.transaction(db, [
      kysely.deleteFrom("memories").where("user_id", "=", userId).where("id", "=", id),
      kysely.deleteFrom("memory_summaries").where("user_id", "=", userId),
    ]);
  });

export const deleteMemoriesByMessage = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  messageId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* QueryDatabase.transaction(db, [
      kysely
        .deleteFrom("memories")
        .where("user_id", "=", userId)
        .where("source", "like", `%:${messageId}`),
      kysely.deleteFrom("memory_summaries").where("user_id", "=", userId),
    ]);
  });

export const insertNote = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  content: string,
) =>
  Effect.gen(function* () {
    const trimmed = content.trim();
    if (trimmed === "") return null;

    const kysely = yield* db.kysely;
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    yield* Effect.promise(() =>
      kysely
        .insertInto("notes")
        .values({
          content: trimmed,
          created_at: createdAt,
          id,
          updated_at: createdAt,
          user_id: userId,
        })
        .execute(),
    );

    return id;
  });

export const updateNote = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  id: string,
  content: string,
) =>
  Effect.gen(function* () {
    const trimmed = content.trim();
    if (trimmed === "") return;

    const kysely = yield* db.kysely;
    yield* Effect.promise(() =>
      kysely
        .updateTable("notes")
        .set({ content: trimmed, updated_at: nowIso() })
        .where("user_id", "=", userId)
        .where("id", "=", id)
        .execute(),
    );
  });

export const deleteNote = <Environment>(db: MemoriesDb<Environment>, userId: string, id: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* Effect.promise(() =>
      kysely.deleteFrom("notes").where("user_id", "=", userId).where("id", "=", id).execute(),
    );
  });

export const getNotes = <Environment>(db: MemoriesDb<Environment>, userId: string, limit = 100) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    return yield* Effect.promise(() =>
      kysely
        .selectFrom("notes")
        .select(["id", "content", "created_at", "updated_at"])
        .where("user_id", "=", userId)
        .orderBy("updated_at", "desc")
        .limit(limit)
        .execute(),
    );
  });

export const searchNotes = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  query: string,
  limit = 10,
) =>
  Effect.gen(function* () {
    const term = query.trim();
    if (term === "") return yield* getNotes(db, userId, limit);

    const kysely = yield* db.kysely;
    return yield* Effect.promise(() =>
      kysely
        .selectFrom("notes")
        .select(["id", "content", "created_at", "updated_at"])
        .where("user_id", "=", userId)
        .where((expressionBuilder) =>
          expressionBuilder(
            expressionBuilder.fn<string>("lower", ["content"]),
            "like",
            `%${term.toLowerCase()}%`,
          ),
        )
        .orderBy("updated_at", "desc")
        .limit(limit)
        .execute(),
    );
  });
