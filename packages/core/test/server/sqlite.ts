import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import * as Effect from "effect/Effect";
import { Kysely, SqliteDialect, type Compilable } from "kysely";
import type { SqliteDatabase, SqliteStatement } from "kysely";
import {
  QueryDatabase,
  type DatabaseRuntime,
  type QueryDatabaseClient,
} from "../../src/server/db/query-database.ts";

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

export const makeSqliteDatabase = <TSchema>({
  schemaDdl,
  runtime,
  setup,
}: {
  readonly schemaDdl: string;
  readonly runtime: DatabaseRuntime;
  readonly setup?: (sqlite: DatabaseSync) => void;
}): QueryDatabaseClient<TSchema> => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schemaDdl);
  setup?.(sqlite);
  const kysely = new Kysely<TSchema>({
    dialect: new SqliteDialect({ database: new NodeSqliteDatabaseAdapter(sqlite) }),
  });
  return {
    kysely: Effect.succeed(kysely),
    runtime,
    batch: (statements: ReadonlyArray<Compilable<unknown>>) =>
      QueryDatabase.tryPromise(async () => {
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
