import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RuntimeContext } from "alchemy";
import * as Effect from "effect/Effect";
import {
  makeQueryDatabaseClient,
  type QueryDatabaseClient,
  type RawQueryDatabaseClient,
} from "../src/db/client.ts";

const migrationsDirectory = fileURLToPath(new URL("../migrations", import.meta.url));

const migrationNames = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .toSorted();

const applyMigrations = (sqlite: DatabaseSync) => {
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const name of migrationNames) {
    sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  }
};

const normalizeRows = <T>(rows: T[]) => rows.map((row) => ({ ...row }));

type D1InputValue = SQLInputValue | boolean;

const normalizeInputValue = (value: D1InputValue): SQLInputValue =>
  typeof value === "boolean" ? Number(value) : value;

class Statement {
  readonly #database: DatabaseSync;
  readonly #sql: string;
  readonly #values: SQLInputValue[];

  constructor(database: DatabaseSync, sql: string, values: D1InputValue[] = []) {
    this.#database = database;
    this.#sql = sql;
    this.#values = values.map(normalizeInputValue);
  }

  bind(...values: D1InputValue[]) {
    return new Statement(this.#database, this.#sql, values);
  }

  toD1Statement() {
    return new D1Statement(this.#database, this.#sql, this.#values);
  }
}

class D1Statement {
  readonly #database: DatabaseSync;
  readonly #sql: string;
  readonly #values: SQLInputValue[];

  constructor(database: DatabaseSync, sql: string, values: D1InputValue[] = []) {
    this.#database = database;
    this.#sql = sql;
    this.#values = values.map(normalizeInputValue);
  }

  bind(...values: D1InputValue[]) {
    return new D1Statement(this.#database, this.#sql, values);
  }

  async all<T>() {
    const statement = this.#database.prepare(this.#sql);
    if (/^\s*(SELECT|WITH|EXPLAIN)/i.test(this.#sql)) {
      return {
        meta: { changes: 0, last_row_id: null },
        results: normalizeRows(statement.all(...this.#values) as T[]),
      };
    }
    const result = statement.run(...this.#values);
    return {
      meta: { changes: Number(result.changes), last_row_id: result.lastInsertRowid },
      results: [],
    };
  }
}

export const makeSqliteDatabase = () => {
  const sqlite = new DatabaseSync(":memory:");
  applyMigrations(sqlite);
  const d1 = {
    prepare: (sql: string) => new D1Statement(sqlite, sql),
    batch: async (statements: D1Statement[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const query = {
    raw: Effect.succeed(d1),
    prepare: (sql: string) => new Statement(sqlite, sql),
    batch: (statements: Statement[]) =>
      Effect.promise(() => d1.batch(statements.map((statement) => statement.toD1Statement()))),
  } as unknown as RawQueryDatabaseClient;
  return {
    db: makeQueryDatabaseClient({ query }),
    sqlite,
  } satisfies { db: QueryDatabaseClient; sqlite: DatabaseSync };
};

export const run = <A, E>(effect: Effect.Effect<A, E, RuntimeContext>) =>
  Effect.runPromise(effect.pipe(Effect.provide(RuntimeContext.phantom)));
