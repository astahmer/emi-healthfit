import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { QueryDatabase, type QueryDatabaseClient } from "./query-database.ts";
import type { MemoryDatabaseSchema } from "./schema.ts";

type MemoriesDb<Environment = never> = QueryDatabaseClient<MemoryDatabaseSchema, Environment>;

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
    const existing = yield* Effect.promise(() =>
      kysely.selectFrom("memories").select("content").where("user_id", "=", userId).execute(),
    );
    const existingKeys = new Set(existing.map((memory) => normalizeMemoryKey(memory.content)));
    const createdAt = db.runtime.now();
    const inserted = candidates
      .filter((candidate) => !existingKeys.has(normalizeMemoryKey(candidate.content)))
      .map((candidate) => ({ id: db.runtime.createId(), ...candidate }));
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
  rank: number;
}

export interface MemoryRecord {
  id: string;
  content: string;
  source: string | null;
  thread_id: string | null;
  created_at: string;
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

type MemorySearchRow = Omit<MemorySearchResult, "rank"> & { rank?: number };

const toMemorySearchResult = (row: MemorySearchRow): MemorySearchResult => ({
  id: row.id,
  content: row.content,
  source: row.source,
  thread_id: row.thread_id,
  created_at: row.created_at,
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

const getMemories = <Environment>(
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

const getMemorySummary = <Environment>(db: MemoriesDb<Environment>, userId: string) =>
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

const upsertMemorySummary = <Environment>(
  db: MemoriesDb<Environment>,
  userId: string,
  content: string,
  memoryCount: number,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const updatedAt = db.runtime.now();
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

const listMemoryIdsForMessage = <Environment>(
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

const deleteMemory = <Environment>(db: MemoriesDb<Environment>, userId: string, id: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* QueryDatabase.transaction(db, [
      kysely.deleteFrom("memories").where("user_id", "=", userId).where("id", "=", id),
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
        .deleteFrom("memories")
        .where("user_id", "=", userId)
        .where("source", "like", `%:${messageId}`),
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
    yield* Effect.promise(() =>
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
    yield* Effect.promise(() =>
      kysely.deleteFrom("notes").where("user_id", "=", userId).where("id", "=", id).execute(),
    );
  });

const getNotes = <Environment>(db: MemoriesDb<Environment>, userId: string, limit = 100) =>
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

const searchNotes = <Environment>(
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

export interface MemoryDatabaseShape {
  readonly deleteMemoriesByMessage: (input: {
    readonly userId: string;
    readonly messageId: string;
  }) => Effect.Effect<void>;
  readonly deleteMemory: (input: {
    readonly userId: string;
    readonly id: string;
  }) => Effect.Effect<void>;
  readonly deleteNote: (input: {
    readonly userId: string;
    readonly id: string;
  }) => Effect.Effect<void>;
  readonly getMemories: (input: {
    readonly userId: string;
    readonly options?: { readonly limit?: number };
  }) => Effect.Effect<ReadonlyArray<MemoryRecord>>;
  readonly getMemorySummary: (input: {
    readonly userId: string;
  }) => Effect.Effect<MemorySummary | undefined>;
  readonly getNotes: (input: {
    readonly userId: string;
    readonly limit?: number;
  }) => Effect.Effect<ReadonlyArray<Note>>;
  readonly insertMemories: (input: {
    readonly userId: string;
    readonly inputs: ReadonlyArray<MemoryInput>;
  }) => Effect.Effect<ReadonlyArray<string>>;
  readonly insertMemory: (input: {
    readonly userId: string;
    readonly content: string;
    readonly source?: string;
    readonly threadId?: string;
    readonly messageId?: string;
  }) => Effect.Effect<string | null>;
  readonly insertNote: (input: {
    readonly userId: string;
    readonly content: string;
  }) => Effect.Effect<string | null>;
  readonly listMemoryIdsForMessage: (input: {
    readonly userId: string;
    readonly messageId: string;
  }) => Effect.Effect<ReadonlyArray<string>>;
  readonly searchMemories: (input: {
    readonly userId: string;
    readonly query: string;
    readonly options?: { readonly limit?: number };
  }) => Effect.Effect<ReadonlyArray<MemorySearchResult>>;
  readonly searchNotes: (input: {
    readonly userId: string;
    readonly query: string;
    readonly limit?: number;
  }) => Effect.Effect<ReadonlyArray<Note>>;
  readonly updateNote: (input: {
    readonly userId: string;
    readonly id: string;
    readonly content: string;
  }) => Effect.Effect<void>;
  readonly upsertMemorySummary: (input: {
    readonly userId: string;
    readonly content: string;
    readonly memoryCount: number;
  }) => Effect.Effect<void>;
}

export class MemoryDatabase extends Context.Service<MemoryDatabase, MemoryDatabaseShape>()(
  "@emi/core/server/database/MemoryDatabase",
) {
  static readonly deleteMemoriesByMessage = (input: {
    readonly userId: string;
    readonly messageId: string;
  }) => Effect.flatMap(MemoryDatabase, (database) => database.deleteMemoriesByMessage(input));

  static readonly deleteMemory = (input: { readonly userId: string; readonly id: string }) =>
    Effect.flatMap(MemoryDatabase, (database) => database.deleteMemory(input));

  static readonly deleteNote = (input: { readonly userId: string; readonly id: string }) =>
    Effect.flatMap(MemoryDatabase, (database) => database.deleteNote(input));

  static readonly getMemories = (input: {
    readonly userId: string;
    readonly options?: { readonly limit?: number };
  }) => Effect.flatMap(MemoryDatabase, (database) => database.getMemories(input));

  static readonly getMemorySummary = (input: { readonly userId: string }) =>
    Effect.flatMap(MemoryDatabase, (database) => database.getMemorySummary(input));

  static readonly getNotes = (input: { readonly userId: string; readonly limit?: number }) =>
    Effect.flatMap(MemoryDatabase, (database) => database.getNotes(input));

  static readonly insertMemories = (input: {
    readonly userId: string;
    readonly inputs: ReadonlyArray<MemoryInput>;
  }) => Effect.flatMap(MemoryDatabase, (database) => database.insertMemories(input));

  static readonly insertMemory = (input: {
    readonly userId: string;
    readonly content: string;
    readonly source?: string;
    readonly threadId?: string;
    readonly messageId?: string;
  }) => Effect.flatMap(MemoryDatabase, (database) => database.insertMemory(input));

  static readonly insertNote = (input: { readonly userId: string; readonly content: string }) =>
    Effect.flatMap(MemoryDatabase, (database) => database.insertNote(input));

  static readonly listMemoryIdsForMessage = (input: {
    readonly userId: string;
    readonly messageId: string;
  }) => Effect.flatMap(MemoryDatabase, (database) => database.listMemoryIdsForMessage(input));

  static readonly searchMemories = (input: {
    readonly userId: string;
    readonly query: string;
    readonly options?: { readonly limit?: number };
  }) => Effect.flatMap(MemoryDatabase, (database) => database.searchMemories(input));

  static readonly searchNotes = (input: {
    readonly userId: string;
    readonly query: string;
    readonly limit?: number;
  }) => Effect.flatMap(MemoryDatabase, (database) => database.searchNotes(input));

  static readonly updateNote = (input: {
    readonly userId: string;
    readonly id: string;
    readonly content: string;
  }) => Effect.flatMap(MemoryDatabase, (database) => database.updateNote(input));

  static readonly upsertMemorySummary = (input: {
    readonly userId: string;
    readonly content: string;
    readonly memoryCount: number;
  }) => Effect.flatMap(MemoryDatabase, (database) => database.upsertMemorySummary(input));

  static layer<Environment>({
    db,
  }: {
    readonly db: MemoriesDb<Environment>;
  }): Layer.Layer<MemoryDatabase, never, Environment> {
    return Layer.effect(
      MemoryDatabase,
      Effect.gen(function* () {
        const context = yield* Effect.context<Environment>();
        const provide = <A>(effect: Effect.Effect<A, never, Environment>) =>
          Effect.provideContext(effect, context);
        return {
          deleteMemoriesByMessage: ({ userId, messageId }) =>
            provide(deleteMemoriesByMessage(db, userId, messageId)),
          deleteMemory: ({ userId, id }) => provide(deleteMemory(db, userId, id)),
          deleteNote: ({ userId, id }) => provide(deleteNote(db, userId, id)),
          getMemories: ({ userId, options }) => provide(getMemories(db, userId, options)),
          getMemorySummary: ({ userId }) => provide(getMemorySummary(db, userId)),
          getNotes: ({ userId, limit }) => provide(getNotes(db, userId, limit)),
          insertMemories: ({ userId, inputs }) => provide(insertMemories(db, userId, [...inputs])),
          insertMemory: ({ userId, content, source, threadId, messageId }) =>
            provide(insertMemory(db, userId, content, source, threadId, messageId)),
          insertNote: ({ userId, content }) => provide(insertNote(db, userId, content)),
          listMemoryIdsForMessage: ({ userId, messageId }) =>
            provide(listMemoryIdsForMessage(db, userId, messageId)),
          searchMemories: ({ userId, query, options }) =>
            provide(searchMemories(db, userId, query, options)),
          searchNotes: ({ userId, query, limit }) => provide(searchNotes(db, userId, query, limit)),
          updateNote: ({ userId, id, content }) => provide(updateNote(db, userId, id, content)),
          upsertMemorySummary: ({ userId, content, memoryCount }) =>
            provide(upsertMemorySummary(db, userId, content, memoryCount)),
        } satisfies MemoryDatabaseShape;
      }),
    );
  }
}
