import * as Effect from "effect/Effect";
import { Kysely, sql, type CompiledQuery } from "kysely";
import { D1Dialect } from "kysely-d1";
import * as Cloudflare from "alchemy/Cloudflare";

import type {
  BodyMetricRow,
  ConversationRow,
  DailyActivityRow,
  HealthWorkoutRow,
  HevySessionRow,
  HevySetRow,
  MemoryRow,
  MessageRow,
  NoteRow,
  SleepSessionRow,
  SuggestionsRow,
  ThreadMessageRow,
  ThreadRow,
} from "./schema.ts";

export type RawQueryDatabaseClient = Effect.Success<ReturnType<typeof Cloudflare.D1.QueryDatabase>>;

export interface DatabaseSchema {
  body_metrics: BodyMetricRow & { user_id: string };
  chat_events: {
    conversation_id: string;
    created_at: string;
    generation_id: string;
    id: string;
    payload: string;
    request_id: string;
    schema_version: number;
    trace_id: string;
    type: string;
    user_id: string;
  };
  chat_generation_chunks: {
    chunk: string;
    created_at: string;
    generation_id: string;
    sequence: number;
    user_id: string;
  };
  chat_generations: {
    conversation_id: string;
    created_at: string;
    error: string | null;
    finish_reason: string | null;
    finished_at: string | null;
    id: string;
    input_tokens: number | null;
    model: string | null;
    output_tokens: number | null;
    request_id: string;
    retry_count: number;
    started_at: string;
    status: string;
    trace_id: string;
    updated_at: string;
    user_id: string;
  };
  conversations: ConversationRow;
  daily_activity: DailyActivityRow & { user_id: string };
  health_workouts: HealthWorkoutRow & { id: number; user_id: string };
  hevy_sessions: HevySessionRow & { user_id: string };
  hevy_sets: HevySetRow & { id: number; user_id: string };
  memories: MemoryRow & { user_id: string };
  messages: MessageRow;
  notes: NoteRow & { user_id: string };
  privacy_preferences: {
    raw_upload_retention_days: number;
    updated_at: string;
    user_id: string;
  };
  sleep_sessions: SleepSessionRow & { user_id: string };
  suggestions: SuggestionsRow & { user_id: string };
  sync_cursors: { last_sync: string | null; source: string; user_id: string };
  thread_messages: ThreadMessageRow;
  threads: ThreadRow;
}

type QueryDatabaseEnvironment =
  ReturnType<RawQueryDatabaseClient["batch"]> extends Effect.Effect<
    unknown,
    unknown,
    infer Environment
  >
    ? Environment
    : never;

class KyselyStatement {
  readonly #client: RawQueryDatabaseClient;
  readonly #query: string;
  readonly #values: ReadonlyArray<unknown>;

  constructor({
    client,
    query,
    values = [],
  }: {
    client: RawQueryDatabaseClient;
    query: string;
    values?: ReadonlyArray<unknown>;
  }) {
    this.#client = client;
    this.#query = query;
    this.#values = values;
  }

  bind(...values: ReadonlyArray<unknown>) {
    return new KyselyStatement({ client: this.#client, query: this.#query, values });
  }

  all<T>() {
    return this.execute<T>().pipe(Effect.map((result) => ({ results: result.rows })));
  }

  first<T>() {
    return this.execute<T>().pipe(Effect.map((result) => result.rows[0] ?? null));
  }

  run<T>() {
    return this.execute<T>().pipe(
      Effect.map((result) => ({
        meta: {
          changes: Number(result.numAffectedRows ?? 0),
        },
      })),
    );
  }

  compile(database: Kysely<DatabaseSchema>): CompiledQuery {
    const fragments = this.#query.split("?");
    let query = sql.raw(fragments[0] ?? "");
    for (let index = 0; index < this.#values.length; index += 1) {
      query = sql`${query}${this.#values[index]}${sql.raw(fragments[index + 1] ?? "")}`;
    }
    return query.compile(database);
  }

  private execute<T>() {
    return this.#client.raw.pipe(
      Effect.map(
        (database) => new Kysely<DatabaseSchema>({ dialect: new D1Dialect({ database }) }),
      ),
      Effect.flatMap((kysely) =>
        Effect.promise(() => kysely.executeQuery<T>(this.compile(kysely))),
      ),
    );
  }
}

export interface QueryDatabaseClient {
  readonly raw: RawQueryDatabaseClient["raw"];
  prepare: (query: string) => KyselyStatement;
  batch: (
    statements: ReadonlyArray<KyselyStatement>,
  ) => Effect.Effect<Array<{ meta: { changes: number } }>, never, QueryDatabaseEnvironment>;
}

export const makeQueryDatabaseClient = ({
  query,
}: {
  query: RawQueryDatabaseClient;
}): QueryDatabaseClient => {
  return {
    raw: query.raw,
    prepare: (statement) => new KyselyStatement({ client: query, query: statement }),
    batch: (statements) =>
      query.raw
        .pipe(
          Effect.map(
            (database) => new Kysely<DatabaseSchema>({ dialect: new D1Dialect({ database }) }),
          ),
          Effect.flatMap((kysely) =>
            query.batch(
              statements.map((statement) => {
                const compiled = statement.compile(kysely);
                return query.prepare(compiled.sql).bind(...compiled.parameters);
              }),
            ),
          ),
        )
        .pipe(
          Effect.map((results) =>
            results.map((result) => ({ meta: { changes: Number(result.meta.changes) } })),
          ),
        ),
  };
};

const BATCH_SIZE = 100;

const chunk = <T>(items: ReadonlyArray<T>, size: number): Array<ReadonlyArray<T>> => {
  const chunks: Array<ReadonlyArray<T>> = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
};

export const runTransaction = (
  db: QueryDatabaseClient,
  statements: ReadonlyArray<ReturnType<QueryDatabaseClient["prepare"]>>,
) => db.batch(statements);

export const runBatches = (
  db: QueryDatabaseClient,
  statements: ReadonlyArray<ReturnType<QueryDatabaseClient["prepare"]>>,
) =>
  Effect.gen(function* () {
    for (const batch of chunk(statements, BATCH_SIZE)) yield* runTransaction(db, batch);
  });
