import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { RuntimeContext } from "alchemy";
import * as Effect from "effect/Effect";
import {
  makeQueryDatabaseClient,
  type QueryDatabaseClient,
  type RawQueryDatabaseClient,
} from "../src/db/client.ts";

const normalizeRows = <T>(rows: T[]) => rows.map((row) => ({ ...row }));

class Statement {
  readonly #database: DatabaseSync;
  readonly #sql: string;
  readonly #values: SQLInputValue[];

  constructor(database: DatabaseSync, sql: string, values: SQLInputValue[] = []) {
    this.#database = database;
    this.#sql = sql;
    this.#values = values;
  }

  bind(...values: SQLInputValue[]) {
    return new Statement(this.#database, this.#sql, values);
  }

  all<T>() {
    return Effect.sync(() => ({
      results: normalizeRows(this.#database.prepare(this.#sql).all(...this.#values) as T[]),
    }));
  }

  first<T>() {
    return Effect.sync(() => {
      const row = this.#database.prepare(this.#sql).get(...this.#values) as T | undefined;
      return row === undefined ? null : { ...row };
    });
  }

  run() {
    return Effect.sync(() => {
      const result = this.#database.prepare(this.#sql).run(...this.#values);
      return { meta: { changes: Number(result.changes) } };
    });
  }

  toD1Statement() {
    return new D1Statement(this.#database, this.#sql, this.#values);
  }
}

class D1Statement {
  readonly #database: DatabaseSync;
  readonly #sql: string;
  readonly #values: SQLInputValue[];

  constructor(database: DatabaseSync, sql: string, values: SQLInputValue[] = []) {
    this.#database = database;
    this.#sql = sql;
    this.#values = values;
  }

  bind(...values: SQLInputValue[]) {
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
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE conversations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT, status TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, parent_id TEXT, role TEXT NOT NULL, parts TEXT NOT NULL, prompt_tokens INTEGER, completion_tokens INTEGER, total_tokens INTEGER, model TEXT, created_at TEXT NOT NULL);
    CREATE TABLE threads (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, anchor_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, title TEXT, status TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE thread_messages (user_id TEXT NOT NULL, thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, included_at TEXT NOT NULL, PRIMARY KEY (user_id, thread_id, message_id));
    CREATE TABLE suggestions (user_id TEXT NOT NULL, id TEXT NOT NULL, suggestions TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (user_id, id));
    CREATE TABLE memories (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content TEXT NOT NULL, source TEXT, thread_id TEXT, created_at TEXT NOT NULL);
    CREATE TABLE notes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE daily_activity (user_id TEXT NOT NULL, date TEXT NOT NULL, active_kcal REAL, steps INTEGER, distance_km REAL, exercise_min INTEGER, flights_climbed INTEGER, PRIMARY KEY (user_id, date));
    CREATE TABLE health_workouts (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL, type TEXT NOT NULL, start_raw TEXT, duration_sec INTEGER, active_kcal REAL, avg_hr REAL, max_hr REAL, min_hr REAL, distance_km REAL, source TEXT, raw_json TEXT, UNIQUE (user_id, date, type, start_raw));
    CREATE TABLE hevy_sessions (user_id TEXT NOT NULL, session_id TEXT NOT NULL, title TEXT, start_time TEXT NOT NULL, end_time TEXT, duration_sec INTEGER, total_volume_kg REAL, PRIMARY KEY (user_id, session_id));
    CREATE TABLE hevy_sets (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL, exercise_title TEXT NOT NULL, set_index INTEGER NOT NULL, set_type TEXT, weight_kg REAL, reps INTEGER, rpe REAL, distance_km REAL, duration_seconds REAL, exercise_notes TEXT, FOREIGN KEY (user_id, session_id) REFERENCES hevy_sessions(user_id, session_id), UNIQUE (user_id, session_id, exercise_title, set_index));
    CREATE TABLE sleep_sessions (user_id TEXT NOT NULL, date TEXT, start TEXT, end TEXT, in_bed_min INTEGER, asleep_min INTEGER, awake_min INTEGER, source TEXT, UNIQUE (user_id, date, start));
    CREATE TABLE body_metrics (user_id TEXT NOT NULL, date TEXT NOT NULL, weight_kg REAL, body_fat_pct REAL, lean_mass_kg REAL, source TEXT, PRIMARY KEY (user_id, date));
    CREATE TABLE sync_cursors (user_id TEXT NOT NULL, source TEXT NOT NULL, last_sync TEXT, PRIMARY KEY (user_id, source));
    CREATE TABLE privacy_preferences (user_id TEXT PRIMARY KEY, raw_upload_retention_days INTEGER NOT NULL DEFAULT 30, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE chat_generations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, request_id TEXT NOT NULL, trace_id TEXT NOT NULL, status TEXT NOT NULL, error TEXT, finish_reason TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, retry_count INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL, finished_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE chat_generation_chunks (user_id TEXT NOT NULL, generation_id TEXT NOT NULL REFERENCES chat_generations(id) ON DELETE CASCADE, sequence INTEGER NOT NULL, chunk TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (user_id, generation_id, sequence));
    CREATE TABLE chat_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, generation_id TEXT NOT NULL REFERENCES chat_generations(id) ON DELETE CASCADE, request_id TEXT NOT NULL, trace_id TEXT NOT NULL, type TEXT NOT NULL, schema_version INTEGER NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
  `);
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
      Effect.tryPromise(() => d1.batch(statements.map((statement) => statement.toD1Statement()))),
  } as unknown as RawQueryDatabaseClient;
  return {
    db: makeQueryDatabaseClient({ query }),
    sqlite,
  } satisfies { db: QueryDatabaseClient; sqlite: DatabaseSync };
};

export const run = <A, E>(effect: Effect.Effect<A, E, RuntimeContext>) =>
  Effect.runPromise(effect.pipe(Effect.provide(RuntimeContext.phantom)));
