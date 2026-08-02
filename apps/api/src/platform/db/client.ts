import type { Kyselify } from "drizzle-orm/kysely";
import { ServerDatabase } from "@emi/core/server/database";
import { Cloudflare as CoreCloudflare } from "@emi/core/cloudflare";
import type {
  CloudflareQueryDatabaseClient,
  DatabaseRuntime,
  RawQueryDatabaseClient,
} from "@emi/core/cloudflare";
import { HealthFit } from "@emi/flavor-healthfit";

const makePlatformD1Kysely = CoreCloudflare.database.makeD1Kysely;
const makePlatformQueryDatabaseClient = CoreCloudflare.database.makeQueryDatabaseClient;
const {
  bodyMetrics,
  dailyActivity,
  healthWorkouts,
  hevyConnections,
  hevySessions,
  hevySets,
  hevySyncState,
  privacyPreferences,
  sleepSessions,
  syncCursors,
} = HealthFit.storage.tables;

export interface DatabaseSchema {
  auth_account: Kyselify<typeof ServerDatabase.tables.auth.account>;
  auth_session: Kyselify<typeof ServerDatabase.tables.auth.session>;
  auth_user: Kyselify<typeof ServerDatabase.tables.auth.user>;
  auth_verification: Kyselify<typeof ServerDatabase.tables.auth.verification>;
  body_metrics: Kyselify<typeof bodyMetrics>;
  chat_events: Kyselify<typeof ServerDatabase.tables.chat.events>;
  chat_generation_chunks: Kyselify<typeof ServerDatabase.tables.chat.generationChunks>;
  chat_generations: Kyselify<typeof ServerDatabase.tables.chat.generations>;
  conversations: Kyselify<typeof ServerDatabase.tables.chat.conversations>;
  daily_activity: Kyselify<typeof dailyActivity>;
  discord_account_links: Kyselify<typeof ServerDatabase.tables.discord.accountLinks>;
  discord_link_codes: Kyselify<typeof ServerDatabase.tables.discord.linkCodes>;
  health_workouts: Kyselify<typeof healthWorkouts>;
  hevy_connections: Kyselify<typeof hevyConnections>;
  hevy_sessions: Kyselify<typeof hevySessions>;
  hevy_sets: Kyselify<typeof hevySets>;
  hevy_sync_state: Kyselify<typeof hevySyncState>;
  memories: Kyselify<typeof ServerDatabase.tables.chat.memories>;
  memory_summaries: Kyselify<typeof ServerDatabase.tables.chat.memorySummaries>;
  messages: Kyselify<typeof ServerDatabase.tables.chat.messages>;
  notes: Kyselify<typeof ServerDatabase.tables.chat.notes>;
  privacy_preferences: Kyselify<typeof privacyPreferences>;
  sleep_sessions: Kyselify<typeof sleepSessions>;
  suggestions: Kyselify<typeof ServerDatabase.tables.chat.suggestions>;
  sync_cursors: Kyselify<typeof syncCursors>;
  thread_messages: Kyselify<typeof ServerDatabase.tables.chat.threadMessages>;
  threads: Kyselify<typeof ServerDatabase.tables.chat.threads>;
}

export type QueryDatabaseClient = CloudflareQueryDatabaseClient<DatabaseSchema>;

export const makeD1Kysely = (database: D1Database) =>
  makePlatformD1Kysely<DatabaseSchema>(database);

export const makeQueryDatabaseClient = ({
  query,
  runtime,
}: {
  query: RawQueryDatabaseClient;
  runtime: DatabaseRuntime;
}): QueryDatabaseClient => makePlatformQueryDatabaseClient<DatabaseSchema>({ query, runtime });

/**
 * Kysely's `Transaction`/`withRecursive` typings make `Kysely<T>` (and thus
 * `QueryDatabaseClient<T>`) structurally invariant in `T`: the app's `DatabaseSchema`
 * client can't be passed directly where core-server/flavor packages expect a client
 * typed for one of their own narrower composed schemas, even though `DatabaseSchema`
 * is a strict superset. Narrow explicitly at these call boundaries instead of
 * widening every downstream function's schema parameter.
 */
export const narrowQueryDatabaseClient = <TSchema>(
  db: QueryDatabaseClient,
): ServerDatabase.QueryDatabaseClient<TSchema> =>
  db as unknown as ServerDatabase.QueryDatabaseClient<TSchema>;
