import * as Effect from "effect/Effect";
import type { Compilable, Kysely } from "kysely";

export interface QueryDatabaseClient<TSchema, TEnvironment = never> {
  readonly kysely: Effect.Effect<Kysely<TSchema>, never, TEnvironment>;
  readonly batch: (
    statements: ReadonlyArray<Compilable<unknown>>,
  ) => Effect.Effect<Array<{ meta: { changes: number } }>, never, TEnvironment>;
}

export const runTransaction = <TSchema, TEnvironment>(
  db: QueryDatabaseClient<TSchema, TEnvironment>,
  statements: ReadonlyArray<Compilable<unknown>>,
) => db.batch(statements);

const batchSize = 100;

const chunk = <T>(items: ReadonlyArray<T>, size: number): Array<ReadonlyArray<T>> => {
  const chunks: Array<ReadonlyArray<T>> = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
};

export const runBatches = <TSchema, TEnvironment>(
  db: QueryDatabaseClient<TSchema, TEnvironment>,
  statements: ReadonlyArray<Compilable<unknown>>,
) =>
  Effect.gen(function* () {
    for (const batch of chunk(statements, batchSize)) yield* runTransaction(db, batch);
  });
