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
import { MemoryStoreLive } from "../../src/server/make-memory-store.ts";
import {
  MemoryReader,
  MemorySummaryStore,
  MemoryWriter,
} from "../../src/server/ports/memory-store.ts";
import { makeRequestContext } from "../../src/server/request-context.ts";
import type { QueryDatabaseClient } from "../../src/server/db/query-database.ts";
import type { MemoryDatabaseSchema } from "../../src/server/db/schema.ts";

const schemaDdl = `
  CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT,
    thread_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE memory_summaries (
    user_id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    memory_count INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

const databaseRuntime = {
  createId: () => "memory-test-id",
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
  )
    return value;
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

const makeInMemoryDb = (): QueryDatabaseClient<MemoryDatabaseSchema, never> => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schemaDdl);
  const kysely = new Kysely<MemoryDatabaseSchema>({
    dialect: new SqliteDialect({ database: new NodeSqliteDatabaseAdapter(sqlite) }),
  });
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

describe("makeMemoryStore", () => {
  it("provides granular memory services through one Effect Layer", async () => {
    const layer = MemoryStoreLive.layer({
      db: makeInMemoryDb(),
      requestContext: makeRequestContext({ userId: "memory-user" }),
    });
    const services = await run(
      Effect.gen(function* () {
        return {
          reader: yield* MemoryReader,
          writer: yield* MemoryWriter,
          summary: yield* MemorySummaryStore,
        };
      }).pipe(Effect.provide(layer)),
    );

    const ids = await run(
      services.writer.insertMany([
        { content: "  Typed memory  ", source: "manual" },
        { content: "typed memory", source: "duplicate" },
      ]),
    );
    assert.deepEqual(ids, ["memory-test-id"]);
    assert.deepEqual(await run(services.reader.list()), [
      {
        id: "memory-test-id",
        content: "Typed memory",
        source: "manual",
        thread_id: null,
        created_at: "2026-08-02T00:00:00.000Z",
        rank: 0,
      },
    ]);
    assert.equal((await run(services.reader.search("typed")))[0]?.id, "memory-test-id");

    await run(services.summary.upsert({ content: "One memory", memoryCount: 1 }));
    const summary = await run(services.summary.get());
    assert.equal(summary?.content, "One memory");
    assert.equal(summary?.memory_count, 1);
    assert.equal(summary?.updated_at, "2026-08-02T00:00:00.000Z");

    await run(services.writer.delete("memory-test-id"));
    assert.deepEqual(await run(services.reader.list()), []);
  });
});
