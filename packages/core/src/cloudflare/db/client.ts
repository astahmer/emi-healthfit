import * as Cloudflare from "alchemy/Cloudflare";
import { RuntimeContext } from "alchemy";
import type { D1Database } from "@cloudflare/workers-types";
import * as Effect from "effect/Effect";
import { Kysely, type Compilable } from "kysely";
import { D1Dialect } from "kysely-d1";
import { DatabaseQueryError } from "../../server/db/query-database.ts";
import type {
  DatabaseRuntime as DatabaseRuntimeRecord,
  QueryDatabaseClient,
} from "../../server/db/query-database.ts";

export type DatabaseRuntime = DatabaseRuntimeRecord;

export type RawQueryDatabaseClient = Effect.Success<ReturnType<typeof Cloudflare.D1.QueryDatabase>>;

export interface CloudflareQueryDatabaseClient<TSchema> extends QueryDatabaseClient<TSchema> {
  readonly raw: Effect.Effect<Effect.Success<RawQueryDatabaseClient["raw"]>, DatabaseQueryError>;
}

const toDatabaseQueryError = (cause: unknown): DatabaseQueryError =>
  new DatabaseQueryError({
    message: cause instanceof Error ? cause.message : String(cause),
  });

const isTransientD1Error = (error: unknown): boolean =>
  /D1_ERROR: Network connection lost/i.test(error instanceof Error ? error.message : String(error));

export class CloudflareDatabase {
  static makeD1Kysely<TSchema>(database: D1Database) {
    return new Kysely<TSchema>({ dialect: new D1Dialect({ database }) });
  }

  static makeQueryDatabaseClient<TSchema>({
    query,
    runtime,
  }: {
    query: RawQueryDatabaseClient;
    runtime: DatabaseRuntime;
  }): CloudflareQueryDatabaseClient<TSchema> {
    return {
      raw: query.raw.pipe(
        Effect.provide(RuntimeContext.phantom),
        Effect.mapError(toDatabaseQueryError),
      ),
      runtime,
      kysely: query.raw.pipe(
        Effect.provide(RuntimeContext.phantom),
        Effect.mapError(toDatabaseQueryError),
        Effect.map((database) => CloudflareDatabase.makeD1Kysely<TSchema>(database)),
      ),
      batch: (statements: ReadonlyArray<Compilable<unknown>>) =>
        query
          .batch(
            statements.map((statement) => {
              const compiled = statement.compile();
              return query.prepare(compiled.sql).bind(...compiled.parameters);
            }),
          )
          .pipe(
            Effect.provide(RuntimeContext.phantom),
            Effect.retry({ times: 2, while: isTransientD1Error }),
            Effect.mapError(toDatabaseQueryError),
            Effect.map((results) =>
              results.map((result) => ({ meta: { changes: Number(result.meta.changes) } })),
            ),
          ),
    };
  }

  static narrowQueryDatabaseClient<TSchema>(database: unknown): QueryDatabaseClient<TSchema> {
    return database as QueryDatabaseClient<TSchema>;
  }
}
