import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { Compilable, Kysely } from "kysely";

export class DatabaseQueryError extends Schema.TaggedErrorClass<DatabaseQueryError>()(
  "DatabaseQueryError",
  { message: Schema.String },
) {}

const toDatabaseQueryError = (cause: unknown): DatabaseQueryError =>
  new DatabaseQueryError({
    message: cause instanceof Error ? cause.message : String(cause),
  });

export interface DatabaseRuntime {
  readonly createId: () => string;
  readonly now: () => string;
  readonly nowMilliseconds: () => number;
  readonly randomBytes: (length: number) => Uint8Array;
}

export interface QueryDatabaseClient<TSchema, TEnvironment = never> {
  readonly kysely: Effect.Effect<Kysely<TSchema>, DatabaseQueryError, TEnvironment>;
  readonly batch: (
    statements: ReadonlyArray<Compilable<unknown>>,
  ) => Effect.Effect<Array<{ meta: { changes: number } }>, DatabaseQueryError, TEnvironment>;
  readonly runtime: DatabaseRuntime;
}

const batchSize = 100;

const chunk = <T>(items: ReadonlyArray<T>, size: number): Array<ReadonlyArray<T>> => {
  const chunks: Array<ReadonlyArray<T>> = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

export class QueryDatabase {
  static tryPromise<Value>(
    execute: () => Promise<Value>,
  ): Effect.Effect<Value, DatabaseQueryError> {
    return Effect.tryPromise({
      try: execute,
      catch: toDatabaseQueryError,
    });
  }

  static transaction<TSchema, TEnvironment>(
    db: QueryDatabaseClient<TSchema, TEnvironment>,
    statements: ReadonlyArray<Compilable<unknown>>,
  ) {
    return db.batch(statements);
  }

  static batches<TSchema, TEnvironment>(
    db: QueryDatabaseClient<TSchema, TEnvironment>,
    statements: ReadonlyArray<Compilable<unknown>>,
  ) {
    return Effect.gen(function* () {
      for (const batch of chunk(statements, batchSize)) {
        yield* QueryDatabase.transaction(db, batch);
      }
    });
  }
}
