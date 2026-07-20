import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import type { Kyselify } from "drizzle-orm/kysely";
import { Kysely, type Compilable } from "kysely";
import { D1Dialect } from "kysely-d1";

import { authAccount, authSession, authUser, authVerification } from "../auth/schema.ts";
import {
  bodyMetrics,
  chatEvents,
  chatGenerationChunks,
  chatGenerations,
  conversations,
  dailyActivity,
  healthWorkouts,
  hevyConnections,
  hevySessions,
  hevySets,
  hevySyncState,
  memories,
  messages,
  notes,
  privacyPreferences,
  sleepSessions,
  suggestions,
  syncCursors,
  threadMessages,
  threads,
} from "./schema.ts";

export type RawQueryDatabaseClient = Effect.Success<ReturnType<typeof Cloudflare.D1.QueryDatabase>>;

export interface DatabaseSchema {
  auth_account: Kyselify<typeof authAccount>;
  auth_session: Kyselify<typeof authSession>;
  auth_user: Kyselify<typeof authUser>;
  auth_verification: Kyselify<typeof authVerification>;
  body_metrics: Kyselify<typeof bodyMetrics>;
  chat_events: Kyselify<typeof chatEvents>;
  chat_generation_chunks: Kyselify<typeof chatGenerationChunks>;
  chat_generations: Kyselify<typeof chatGenerations>;
  conversations: Kyselify<typeof conversations>;
  daily_activity: Kyselify<typeof dailyActivity>;
  health_workouts: Kyselify<typeof healthWorkouts>;
  hevy_connections: Kyselify<typeof hevyConnections>;
  hevy_sessions: Kyselify<typeof hevySessions>;
  hevy_sets: Kyselify<typeof hevySets>;
  hevy_sync_state: Kyselify<typeof hevySyncState>;
  memories: Kyselify<typeof memories>;
  messages: Kyselify<typeof messages>;
  notes: Kyselify<typeof notes>;
  privacy_preferences: Kyselify<typeof privacyPreferences>;
  sleep_sessions: Kyselify<typeof sleepSessions>;
  suggestions: Kyselify<typeof suggestions>;
  sync_cursors: Kyselify<typeof syncCursors>;
  thread_messages: Kyselify<typeof threadMessages>;
  threads: Kyselify<typeof threads>;
}

type QueryDatabaseEnvironment =
  ReturnType<RawQueryDatabaseClient["batch"]> extends Effect.Effect<
    unknown,
    unknown,
    infer Environment
  >
    ? Environment
    : never;

export interface QueryDatabaseClient {
  readonly raw: RawQueryDatabaseClient["raw"];
  readonly kysely: Effect.Effect<Kysely<DatabaseSchema>, never, QueryDatabaseEnvironment>;
  batch: (
    statements: ReadonlyArray<Compilable<unknown>>,
  ) => Effect.Effect<Array<{ meta: { changes: number } }>, never, QueryDatabaseEnvironment>;
}

export const makeD1Kysely = (database: D1Database) =>
  new Kysely<DatabaseSchema>({ dialect: new D1Dialect({ database }) });

export const makeQueryDatabaseClient = ({
  query,
}: {
  query: RawQueryDatabaseClient;
}): QueryDatabaseClient => ({
  raw: query.raw,
  kysely: query.raw.pipe(Effect.map(makeD1Kysely)),
  batch: (statements) =>
    query
      .batch(
        statements.map((statement) => {
          const compiled = statement.compile();
          return query.prepare(compiled.sql).bind(...compiled.parameters);
        }),
      )
      .pipe(
        Effect.map((results) =>
          results.map((result) => ({ meta: { changes: Number(result.meta.changes) } })),
        ),
      ),
});

const batchSize = 100;

const chunk = <T>(items: ReadonlyArray<T>, size: number): Array<ReadonlyArray<T>> => {
  const chunks: Array<ReadonlyArray<T>> = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
};

export const runTransaction = (
  db: QueryDatabaseClient,
  statements: ReadonlyArray<Compilable<unknown>>,
) => db.batch(statements);

export const runBatches = (
  db: QueryDatabaseClient,
  statements: ReadonlyArray<Compilable<unknown>>,
) =>
  Effect.gen(function* () {
    for (const batch of chunk(statements, batchSize)) yield* runTransaction(db, batch);
  });
