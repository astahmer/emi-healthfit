import type { Kyselify } from "drizzle-orm/kysely";
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
  chatEvents,
  chatGenerationChunks,
  chatGenerations,
  conversations,
  discordAccountLinks,
  discordLinkCodes,
  memories,
  memorySummaries,
  messages,
  notes,
  suggestions,
  threadMessages,
  threads,
  type QueryDatabaseClient as GenericQueryDatabaseClient,
} from "@emi/core/server";
import {
  makeD1Kysely as makePlatformD1Kysely,
  makeQueryDatabaseClient as makePlatformQueryDatabaseClient,
  type CloudflareQueryDatabaseClient,
  type RawQueryDatabaseClient,
} from "@emi/core/cloudflare";
import {
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
} from "@emi/flavor-healthfit";

export { runTransaction, runBatches } from "@emi/core/server";
export type { RawQueryDatabaseClient } from "@emi/core/cloudflare";

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
  discord_account_links: Kyselify<typeof discordAccountLinks>;
  discord_link_codes: Kyselify<typeof discordLinkCodes>;
  health_workouts: Kyselify<typeof healthWorkouts>;
  hevy_connections: Kyselify<typeof hevyConnections>;
  hevy_sessions: Kyselify<typeof hevySessions>;
  hevy_sets: Kyselify<typeof hevySets>;
  hevy_sync_state: Kyselify<typeof hevySyncState>;
  memories: Kyselify<typeof memories>;
  memory_summaries: Kyselify<typeof memorySummaries>;
  messages: Kyselify<typeof messages>;
  notes: Kyselify<typeof notes>;
  privacy_preferences: Kyselify<typeof privacyPreferences>;
  sleep_sessions: Kyselify<typeof sleepSessions>;
  suggestions: Kyselify<typeof suggestions>;
  sync_cursors: Kyselify<typeof syncCursors>;
  thread_messages: Kyselify<typeof threadMessages>;
  threads: Kyselify<typeof threads>;
}

export type QueryDatabaseClient = CloudflareQueryDatabaseClient<DatabaseSchema>;

export const makeD1Kysely = (database: D1Database) =>
  makePlatformD1Kysely<DatabaseSchema>(database);

export const makeQueryDatabaseClient = ({
  query,
}: {
  query: RawQueryDatabaseClient;
}): QueryDatabaseClient => makePlatformQueryDatabaseClient<DatabaseSchema>({ query });

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
): GenericQueryDatabaseClient<TSchema> => db as unknown as GenericQueryDatabaseClient<TSchema>;
