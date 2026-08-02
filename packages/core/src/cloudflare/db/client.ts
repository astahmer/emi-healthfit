import * as Cloudflare from "alchemy/Cloudflare";
import type { D1Database } from "@cloudflare/workers-types";
import * as Effect from "effect/Effect";
import { Kysely, type Compilable } from "kysely";
import { D1Dialect } from "kysely-d1";
import type { QueryDatabaseClient } from "../../server/db/query-database.ts";

export type RawQueryDatabaseClient = Effect.Success<ReturnType<typeof Cloudflare.D1.QueryDatabase>>;

type QueryDatabaseEnvironment =
  ReturnType<RawQueryDatabaseClient["batch"]> extends Effect.Effect<
    unknown,
    unknown,
    infer Environment
  >
    ? Environment
    : never;

export interface CloudflareQueryDatabaseClient<TSchema> extends QueryDatabaseClient<
  TSchema,
  QueryDatabaseEnvironment
> {
  readonly raw: RawQueryDatabaseClient["raw"];
}

const isTransientD1Error = (error: unknown): boolean =>
  /D1_ERROR: Network connection lost/i.test(error instanceof Error ? error.message : String(error));

export const makeD1Kysely = <TSchema>(database: D1Database) =>
  new Kysely<TSchema>({ dialect: new D1Dialect({ database }) });

export const makeQueryDatabaseClient = <TSchema>({
  query,
}: {
  query: RawQueryDatabaseClient;
}): CloudflareQueryDatabaseClient<TSchema> => ({
  raw: query.raw,
  kysely: query.raw.pipe(Effect.map((database) => makeD1Kysely<TSchema>(database))),
  batch: (statements: ReadonlyArray<Compilable<unknown>>) =>
    query
      .batch(
        statements.map((statement) => {
          const compiled = statement.compile();
          return query.prepare(compiled.sql).bind(...compiled.parameters);
        }),
      )
      .pipe(
        Effect.retry({ times: 2, while: isTransientD1Error }),
        Effect.map((results) =>
          results.map((result) => ({ meta: { changes: Number(result.meta.changes) } })),
        ),
      ),
});
