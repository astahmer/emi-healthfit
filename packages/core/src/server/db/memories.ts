import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DatabaseQueryError, QueryDatabase, type QueryDatabaseClient } from "./query-database.ts";
import type { MemoryDatabaseSchema } from "./schema.ts";
import { maxSearchTokens, scoreMemorySearch, tokenize } from "../memory-search.ts";

type MemoriesDb<Environment = never> = QueryDatabaseClient<MemoryDatabaseSchema, Environment>;

type DatabaseEffect<Value, Error = never> = Effect.Effect<Value, Error | DatabaseQueryError>;

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

const insertMemories = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  inputs: MemoryInput[],
) =>
  Effect.gen(function* () {
    const unique = new Map<string, MemoryInput>();
    for (const input of inputs) {
      const content = normalizeContent(input.content);
      if (content !== "" && !unique.has(normalizeMemoryKey(content))) {
        unique.set(normalizeMemoryKey(content), { ...input, content });
      }
    }
    const candidates = [...unique.values()];
    if (candidates.length === 0) return [];

    const kysely = yield* db.kysely;
    const existing = yield* QueryDatabase.tryPromise(() =>
      kysely
        .selectFrom("memories")
        .select("content")
        .where("user_id", "=", userId)
        .where("deleted_at", "is", null)
        .execute(),
    );
    const existingKeys = new Set(existing.map((memory) => normalizeMemoryKey(memory.content)));
    const createdAt = db.runtime.now();
    const inserted = candidates.flatMap((candidate) =>
      existingKeys.has(normalizeMemoryKey(candidate.content))
        ? []
        : [{ id: db.runtime.createId(), ...candidate }],
    );
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

const insertMemory = <Environment>(
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
  deleted: boolean;
  rank: number;
}

export interface MemoryRecord {
  id: string;
  content: string;
  source: string | null;
  thread_id: string | null;
  created_at: string;
  deleted: boolean;
}

export interface MemorySummary {
  content: string;
  memory_count: number;
  updated_at: string;
}

export interface Note {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

type MemorySearchRow = Omit<MemorySearchResult, "rank" | "deleted"> & {
  rank?: number;
  deleted_at: string | null;
};

export const retryTokenSearch = <Row, Environment = never>(
  search: (
    tokens: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlyArray<Row>, DatabaseQueryError, Environment>,
  tokens: ReadonlyArray<string>,
  context?: { readonly userId: string; readonly query: string },
): Effect.Effect<ReadonlyArray<Row>, never, Environment> =>
  Effect.gen(function* () {
    let remaining = tokens;
    let rows: ReadonlyArray<Row> | null = null;
    let lastError: string | null = null;
    while (rows === null) {
      const attempt = yield* search(remaining).pipe(
        Effect.catchTag("DatabaseQueryError", (error) => {
          lastError = error.message;
          return Effect.succeed(null);
        }),
      );
      if (attempt !== null) {
        rows = attempt;
        break;
      }
      if (remaining.length === 0) break;
      yield* Effect.logDebug("memory.search-retry").pipe(
        Effect.annotateLogs({
          remainingTokens: remaining.length,
          error: lastError ?? "unknown",
          ...context,
        }),
      );
      remaining = remaining.length === 1 ? [] : remaining.slice(0, Math.ceil(remaining.length / 2));
    }
    if (rows === null) {
      yield* Effect.logWarning("memory.search-failed").pipe(
        Effect.annotateLogs({
          queryTokens: tokens.length,
          error: lastError ?? "unknown",
          ...context,
        }),
      );
      return [];
    }
    return rows;
  });

const toMemorySearchResult = (row: MemorySearchRow): MemorySearchResult => ({
  id: row.id,
  content: row.content,
  source: row.source,
  thread_id: row.thread_id,
  created_at: row.created_at,
  deleted: row.deleted_at !== null,
  rank: row.rank ?? 0,
});

const searchMemories = <Environment>(
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
      const result = yield* QueryDatabase.tryPromise(() =>
        kysely
          .selectFrom("memories")
          .select(["id", "content", "source", "thread_id", "created_at", "deleted_at"])
          .where("user_id", "=", userId)
          .where("deleted_at", "is", null)
          .orderBy("created_at", "desc")
          .limit(limit)
          .execute(),
      );
      return result.map(toMemorySearchResult);
    }

    const tokens = tokenize(term).slice(0, maxSearchTokens);
    if (tokens.length === 0) return [];
    const baseQuery = kysely
      .selectFrom("memories")
      .select(["id", "content", "source", "thread_id", "created_at", "deleted_at"])
      .where("user_id", "=", userId)
      .where("deleted_at", "is", null);
    const result = yield* retryTokenSearch(
      (searchTokens) =>
        QueryDatabase.tryPromise(() => {
          const scopedQuery =
            searchTokens.length === 0
              ? baseQuery
              : baseQuery.where((expressionBuilder) =>
                  expressionBuilder.or(
                    searchTokens.map((token) =>
                      expressionBuilder(
                        expressionBuilder.fn<number>("instr", [
                          expressionBuilder.fn<string>("lower", ["content"]),
                          expressionBuilder.val(token),
                        ]),
                        ">",
                        0,
                      ),
                    ),
                  ),
                );
          return scopedQuery.orderBy("created_at", "desc").execute();
        }),
      tokens,
      { userId, query: term },
    );
    const scored = result
      .map((row) => ({
        row,
        score: scoreMemorySearch({ query: term, content: row.content }),
      }))
      .filter((entry) => entry.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          (a.row.created_at < b.row.created_at ? 1 : a.row.created_at > b.row.created_at ? -1 : 0),
      );
    return scored
      .slice(0, limit)
      .map(({ row, score }) => toMemorySearchResult({ ...row, rank: score }));
  });

const getMemories = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  options: { limit?: number; deletedOnly?: boolean } = {},
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const query = kysely
      .selectFrom("memories")
      .select(["id", "content", "source", "thread_id", "created_at", "deleted_at"])
      .where("user_id", "=", userId);
    const scopedQuery =
      options.deletedOnly === true
        ? query.where("deleted_at", "is not", null)
        : query.where("deleted_at", "is", null);
    const rows = yield* QueryDatabase.tryPromise(() =>
      scopedQuery
        .orderBy("created_at", "desc")
        .limit(options.limit ?? 100)
        .execute(),
    );
    return rows.map(toMemorySearchResult);
  });

const countMemories = <Environment>(db: MemoriesDb<Environment>, userId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* QueryDatabase.tryPromise(() =>
      kysely
        .selectFrom("memories")
        .select((expressionBuilder) => expressionBuilder.fn.countAll<number>().as("count"))
        .where("user_id", "=", userId)
        .where("deleted_at", "is", null)
        .executeTakeFirst(),
    );
    return result?.count ?? 0;
  });

const getMemorySummary = <Environment>(db: MemoriesDb<Environment>, userId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    return yield* QueryDatabase.tryPromise(() =>
      kysely
        .selectFrom("memory_summaries")
        .select(["content", "memory_count", "updated_at"])
        .where("user_id", "=", userId)
        .executeTakeFirst(),
    );
  });

const upsertMemorySummary = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  content: string,
  memoryCount: number,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const updatedAt = db.runtime.now();
    yield* QueryDatabase.tryPromise(() =>
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

const listMemoryIdsForMessage = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  messageId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* QueryDatabase.tryPromise(() =>
      kysely
        .selectFrom("memories")
        .select("id")
        .where("user_id", "=", userId)
        .where("deleted_at", "is", null)
        .where("source", "like", `%:${messageId}`)
        .execute(),
    );
    return result.map((row) => row.id);
  });

const deleteMemory = <Environment>(db: MemoriesDb<Environment>, userId: string, id: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* QueryDatabase.transaction(db, [
      kysely
        .updateTable("memories")
        .set({ deleted_at: db.runtime.now() })
        .where("user_id", "=", userId)
        .where("id", "=", id)
        .where("deleted_at", "is", null),
      kysely.deleteFrom("memory_summaries").where("user_id", "=", userId),
    ]);
  });

const deleteMemoriesByMessage = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  messageId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* QueryDatabase.transaction(db, [
      kysely
        .updateTable("memories")
        .set({ deleted_at: db.runtime.now() })
        .where("user_id", "=", userId)
        .where("deleted_at", "is", null)
        .where("source", "like", `%:${messageId}`),
      kysely.deleteFrom("memory_summaries").where("user_id", "=", userId),
    ]);
  });

const restoreMemory = <Environment>(db: MemoriesDb<Environment>, userId: string, id: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* QueryDatabase.transaction(db, [
      kysely
        .updateTable("memories")
        .set({ deleted_at: null })
        .where("user_id", "=", userId)
        .where("id", "=", id),
      kysely.deleteFrom("memory_summaries").where("user_id", "=", userId),
    ]);
  });

const softDeleteMemories = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  targets: {
    readonly messageIds: ReadonlyArray<string>;
    readonly threadIds: ReadonlyArray<string>;
  },
) =>
  Effect.gen(function* () {
    if (targets.messageIds.length === 0 && targets.threadIds.length === 0) return;
    const kysely = yield* db.kysely;
    yield* QueryDatabase.transaction(db, [
      kysely
        .updateTable("memories")
        .set({ deleted_at: db.runtime.now() })
        .where("user_id", "=", userId)
        .where("deleted_at", "is", null)
        .where((expressionBuilder) =>
          expressionBuilder.or([
            ...targets.messageIds.map((id) => expressionBuilder("source", "like", `%:${id}`)),
            ...(targets.threadIds.length === 0
              ? []
              : [expressionBuilder("thread_id", "in", [...targets.threadIds])]),
          ]),
        ),
      kysely.deleteFrom("memory_summaries").where("user_id", "=", userId),
    ]);
  });

const insertNote = <Environment>(db: MemoriesDb<Environment>, userId: string, content: string) =>
  Effect.gen(function* () {
    const trimmed = content.trim();
    if (trimmed === "") return null;

    const kysely = yield* db.kysely;
    const id = db.runtime.createId();
    const createdAt = db.runtime.now();
    yield* QueryDatabase.tryPromise(() =>
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

const updateNote = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  id: string,
  content: string,
) =>
  Effect.gen(function* () {
    const trimmed = content.trim();
    if (trimmed === "") return;

    const kysely = yield* db.kysely;
    yield* QueryDatabase.tryPromise(() =>
      kysely
        .updateTable("notes")
        .set({ content: trimmed, updated_at: db.runtime.now() })
        .where("user_id", "=", userId)
        .where("id", "=", id)
        .execute(),
    );
  });

const deleteNote = <Environment>(db: MemoriesDb<Environment>, userId: string, id: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* QueryDatabase.tryPromise(() =>
      kysely.deleteFrom("notes").where("user_id", "=", userId).where("id", "=", id).execute(),
    );
  });

const getNotes = <Environment>(db: MemoriesDb<Environment>, userId: string, limit = 100) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    return yield* QueryDatabase.tryPromise(() =>
      kysely
        .selectFrom("notes")
        .select(["id", "content", "created_at", "updated_at"])
        .where("user_id", "=", userId)
        .orderBy("updated_at", "desc")
        .limit(limit)
        .execute(),
    );
  });

const searchNotes = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  query: string,
  limit = 10,
) =>
  Effect.gen(function* () {
    const term = query.trim();
    if (term === "") return yield* getNotes(db, userId, limit);

    const tokens = tokenize(term).slice(0, maxSearchTokens);
    if (tokens.length === 0) return [];

    const kysely = yield* db.kysely;
    const baseQuery = kysely
      .selectFrom("notes")
      .select(["id", "content", "created_at", "updated_at"])
      .where("user_id", "=", userId);
    return yield* retryTokenSearch(
      (searchTokens) =>
        searchTokens.length === 0
          ? Effect.succeed([])
          : QueryDatabase.tryPromise(() =>
              baseQuery
                .where((expressionBuilder) =>
                  expressionBuilder.or(
                    searchTokens.map((token) =>
                      expressionBuilder(
                        expressionBuilder.fn<number>("instr", [
                          expressionBuilder.fn<string>("lower", ["content"]),
                          expressionBuilder.val(token),
                        ]),
                        ">",
                        0,
                      ),
                    ),
                  ),
                )
                .orderBy("updated_at", "desc")
                .limit(limit)
                .execute(),
            ),
      tokens,
      { userId, query: term },
    );
  });

export interface MemoryDatabaseShape {
  readonly deleteMemoriesByMessage: (input: {
    readonly userId: string;
    readonly messageId: string;
  }) => DatabaseEffect<void>;
  readonly countMemories: (input: { readonly userId: string }) => DatabaseEffect<number>;
  readonly deleteMemory: (input: {
    readonly userId: string;
    readonly id: string;
  }) => DatabaseEffect<void>;
  readonly deleteNote: (input: {
    readonly userId: string;
    readonly id: string;
  }) => DatabaseEffect<void>;
  readonly getMemories: (input: {
    readonly userId: string;
    readonly options?: { readonly limit?: number; readonly deletedOnly?: boolean };
  }) => DatabaseEffect<ReadonlyArray<MemoryRecord>>;
  readonly getMemorySummary: (input: {
    readonly userId: string;
  }) => DatabaseEffect<MemorySummary | undefined>;
  readonly getNotes: (input: {
    readonly userId: string;
    readonly limit?: number;
  }) => DatabaseEffect<ReadonlyArray<Note>>;
  readonly insertMemories: (input: {
    readonly userId: string;
    readonly inputs: ReadonlyArray<MemoryInput>;
  }) => DatabaseEffect<ReadonlyArray<string>>;
  readonly insertMemory: (input: {
    readonly userId: string;
    readonly content: string;
    readonly source?: string;
    readonly threadId?: string;
    readonly messageId?: string;
  }) => DatabaseEffect<string | null>;
  readonly insertNote: (input: {
    readonly userId: string;
    readonly content: string;
  }) => DatabaseEffect<string | null>;
  readonly listMemoryIdsForMessage: (input: {
    readonly userId: string;
    readonly messageId: string;
  }) => DatabaseEffect<ReadonlyArray<string>>;
  readonly searchMemories: (input: {
    readonly userId: string;
    readonly query: string;
    readonly options?: { readonly limit?: number };
  }) => DatabaseEffect<ReadonlyArray<MemorySearchResult>>;
  readonly searchNotes: (input: {
    readonly userId: string;
    readonly query: string;
    readonly limit?: number;
  }) => DatabaseEffect<ReadonlyArray<Note>>;
  readonly restoreMemory: (input: {
    readonly userId: string;
    readonly id: string;
  }) => DatabaseEffect<void>;
  readonly softDeleteMemories: (input: {
    readonly userId: string;
    readonly messageIds: ReadonlyArray<string>;
    readonly threadIds: ReadonlyArray<string>;
  }) => DatabaseEffect<void>;
  readonly updateNote: (input: {
    readonly userId: string;
    readonly id: string;
    readonly content: string;
  }) => DatabaseEffect<void>;
  readonly upsertMemorySummary: (input: {
    readonly userId: string;
    readonly content: string;
    readonly memoryCount: number;
  }) => DatabaseEffect<void>;
}

export class MemoryDatabase extends Context.Service<MemoryDatabase, MemoryDatabaseShape>()(
  "@emi/core/server/database/MemoryDatabase",
) {
  static layer({ db }: { readonly db: MemoriesDb }): Layer.Layer<MemoryDatabase> {
    return Layer.succeed(MemoryDatabase, {
      deleteMemoriesByMessage: ({ userId, messageId }) =>
        deleteMemoriesByMessage(db, userId, messageId),
      countMemories: ({ userId }) => countMemories(db, userId),
      deleteMemory: ({ userId, id }) => deleteMemory(db, userId, id),
      deleteNote: ({ userId, id }) => deleteNote(db, userId, id),
      getMemories: ({ userId, options }) => getMemories(db, userId, options),
      getMemorySummary: ({ userId }) => getMemorySummary(db, userId),
      getNotes: ({ userId, limit }) => getNotes(db, userId, limit),
      insertMemories: ({ userId, inputs }) => insertMemories(db, userId, [...inputs]),
      insertMemory: ({ userId, content, source, threadId, messageId }) =>
        insertMemory(db, userId, content, source, threadId, messageId),
      insertNote: ({ userId, content }) => insertNote(db, userId, content),
      listMemoryIdsForMessage: ({ userId, messageId }) =>
        listMemoryIdsForMessage(db, userId, messageId),
      searchMemories: ({ userId, query, options }) => searchMemories(db, userId, query, options),
      searchNotes: ({ userId, query, limit }) => searchNotes(db, userId, query, limit),
      restoreMemory: ({ userId, id }) => restoreMemory(db, userId, id),
      softDeleteMemories: ({ userId, messageIds, threadIds }) =>
        softDeleteMemories(db, userId, { messageIds, threadIds }),
      updateNote: ({ userId, id, content }) => updateNote(db, userId, id, content),
      upsertMemorySummary: ({ userId, content, memoryCount }) =>
        upsertMemorySummary(db, userId, content, memoryCount),
    });
  }
}
