import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import {
  Kysely,
  SqliteDialect,
  type Compilable,
  type SqliteDatabase,
  type SqliteStatement,
} from "kysely";
import { GenerationStoreLive } from "../../src/server/make-generation-store.ts";
import {
  GenerationChunkReader,
  GenerationChunkWriter,
  GenerationConflictError,
  GenerationReader,
  GenerationWriter,
} from "../../src/server/ports/generation-store.ts";
import { makeRequestContext } from "../../src/server/request-context.ts";
import type { QueryDatabaseClient } from "../../src/server/db/query-database.ts";
import type { ConversationDatabaseSchema } from "../../src/server/db/schema.ts";

const schemaDdl = `
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    status TEXT NOT NULL,
    pinned INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE chat_generations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    finish_reason TEXT,
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (conversation_id, request_id)
  );
  CREATE TABLE chat_generation_chunks (
    user_id TEXT NOT NULL,
    generation_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    chunk TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, generation_id, sequence)
  );
`;

const databaseRuntime = {
  createId: () => "generation-test-id",
  now: () => "2026-08-02T00:00:00.000Z",
  nowMilliseconds: () => Date.parse("2026-08-02T00:00:00.000Z"),
  randomBytes: (length: number) => new Uint8Array(length).fill(7),
};

const normalizeParameter = (value: unknown): SQLInputValue => {
  if (typeof value === "boolean") return Number(value);
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "string" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  throw new Error(`Unsupported SQLite parameter: ${typeof value}`);
};

class NodeSqliteStatementAdapter implements SqliteStatement {
  readonly reader: boolean;
  readonly #statement: ReturnType<DatabaseSync["prepare"]>;

  constructor(statement: ReturnType<DatabaseSync["prepare"]>, sql: string) {
    this.#statement = statement;
    this.reader = /^\s*(select|with|pragma)/i.test(sql);
  }

  all(parameters: ReadonlyArray<unknown>): unknown[] {
    return this.#statement.all(...parameters.map(normalizeParameter));
  }

  run(parameters: ReadonlyArray<unknown>) {
    const result = this.#statement.run(...parameters.map(normalizeParameter));
    return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
  }

  iterate(parameters: ReadonlyArray<unknown>): IterableIterator<unknown> {
    return this.#statement.iterate(...parameters.map(normalizeParameter));
  }
}

class NodeSqliteDatabaseAdapter implements SqliteDatabase {
  readonly #sqlite: DatabaseSync;

  constructor(sqlite: DatabaseSync) {
    this.#sqlite = sqlite;
  }

  close(): void {
    this.#sqlite.close();
  }

  prepare(sql: string): SqliteStatement {
    return new NodeSqliteStatementAdapter(this.#sqlite.prepare(sql), sql);
  }
}

const makeInMemoryDb = (): QueryDatabaseClient<ConversationDatabaseSchema, never> => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schemaDdl);
  const kysely = new Kysely<ConversationDatabaseSchema>({
    dialect: new SqliteDialect({ database: new NodeSqliteDatabaseAdapter(sqlite) }),
  });
  sqlite
    .prepare(
      "INSERT INTO conversations (id, user_id, title, status, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      "conversation-generation",
      "generation-user",
      "Generation",
      "regular",
      0,
      databaseRuntime.now(),
      databaseRuntime.now(),
    );
  return {
    kysely: Effect.succeed(kysely),
    runtime: databaseRuntime,
    batch: (statements: ReadonlyArray<Compilable<unknown>>) =>
      Effect.promise(async () => {
        const results: Array<{ meta: { changes: number } }> = [];
        for (const statement of statements) {
          const compiled = statement.compile();
          const changes = await kysely
            .executeQuery(compiled)
            .then((result) => Number(result.numAffectedRows ?? 0));
          results.push({ meta: { changes } });
        }
        return results;
      }),
  };
};

const run = <Value, Error>(effect: Effect.Effect<Value, Error, never>) => Effect.runPromise(effect);

describe("makeGenerationStore", () => {
  it("provides granular generation services through one real SQLite Effect Layer", async () => {
    const layer = GenerationStoreLive.layer({
      db: makeInMemoryDb(),
      requestContext: makeRequestContext({ userId: "generation-user" }),
    });
    const services = await run(
      Effect.gen(function* () {
        return {
          reader: yield* GenerationReader,
          writer: yield* GenerationWriter,
          chunkReader: yield* GenerationChunkReader,
          chunkWriter: yield* GenerationChunkWriter,
        };
      }).pipe(Effect.provide(layer)),
    );

    assert.equal(
      await run(
        services.writer.create({
          generationId: "generation-1",
          conversationId: "conversation-generation",
          requestId: "request-1",
          model: "test-model",
        }),
      ),
      true,
    );
    assert.deepEqual(
      await run(
        services.reader.getByRequestId({
          conversationId: "conversation-generation",
          requestId: "request-1",
        }),
      ),
      {
        id: "generation-1",
        conversationId: "conversation-generation",
        requestId: "request-1",
        status: "pending",
        error: null,
      },
    );
    await run(services.writer.markStreaming("generation-1"));
    await run(
      services.chunkWriter.append({
        generationId: "generation-1",
        sequence: 0,
        chunk: { type: "start" },
      }),
    );
    assert.deepEqual(
      await run(
        services.chunkReader.getChunks({ generationId: "generation-1", afterSequence: -1 }),
      ),
      [{ sequence: 0, chunk: { type: "start" } }],
    );
    await run(services.writer.finish({ generationId: "generation-1", status: "completed" }));
    assert.equal((await run(services.reader.get("generation-1")))?.status, "completed");
    assert.equal(await run(services.reader.getResumable("conversation-generation")), null);
  });

  it("maps the database uniqueness race to the provider-neutral conflict error", async () => {
    const db = makeInMemoryDb();
    const store = GenerationStoreLive.shapes({
      db,
      requestContext: makeRequestContext({ userId: "generation-user" }),
    });
    const input = {
      generationId: "generation-race",
      conversationId: "conversation-generation",
      requestId: "request-race",
    };
    await run(store.writer.create(input));
    await assert.rejects(
      run(store.writer.create({ ...input, generationId: "generation-race-2" })),
      (error) => {
        return (
          error instanceof GenerationConflictError &&
          error.conversationId === input.conversationId &&
          error.generationId === input.generationId
        );
      },
    );
  });
});
