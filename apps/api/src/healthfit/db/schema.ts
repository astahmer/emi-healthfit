import {
  foreignKey,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const dailyActivity = sqliteTable(
  "daily_activity",
  {
    user_id: text().notNull(),
    date: text().notNull(),
    active_kcal: real(),
    steps: integer(),
    distance_km: real(),
    exercise_min: integer(),
    flights_climbed: integer(),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.date] })],
);

export const healthWorkouts = sqliteTable(
  "health_workouts",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    user_id: text().notNull(),
    date: text().notNull(),
    type: text().notNull(),
    start_raw: text(),
    duration_sec: integer(),
    active_kcal: real(),
    avg_hr: real(),
    max_hr: real(),
    min_hr: real(),
    distance_km: real(),
    source: text(),
    raw_json: text(),
  },
  (table) => [unique().on(table.user_id, table.date, table.type, table.start_raw)],
);

export const hevySessions = sqliteTable(
  "hevy_sessions",
  {
    user_id: text().notNull(),
    session_id: text().notNull(),
    provider_workout_id: text(),
    source_updated_at: text(),
    title: text(),
    start_time: text().notNull(),
    end_time: text(),
    duration_sec: integer(),
    total_volume_kg: real(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.session_id] }),
    uniqueIndex("hevy_sessions_user_provider_workout_uidx").on(
      table.user_id,
      table.provider_workout_id,
    ),
  ],
);

export const hevySets = sqliteTable(
  "hevy_sets",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    user_id: text().notNull(),
    session_id: text().notNull(),
    exercise_template_id: text(),
    exercise_index: integer().notNull().default(0),
    exercise_title: text().notNull(),
    set_index: integer().notNull(),
    set_type: text(),
    weight_kg: real(),
    reps: integer(),
    rpe: real(),
    distance_km: real(),
    duration_seconds: real(),
    exercise_notes: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.user_id, table.session_id],
      foreignColumns: [hevySessions.user_id, hevySessions.session_id],
    }),
    unique().on(table.user_id, table.session_id, table.exercise_index, table.set_index),
  ],
);

export const hevyConnections = sqliteTable("hevy_connections", {
  user_id: text().primaryKey(),
  provider_user_id: text(),
  encrypted_api_key: text().notNull(),
  encryption_iv: text().notNull(),
  encryption_version: text().notNull(),
  status: text().notNull(),
  created_at: text().notNull(),
  updated_at: text().notNull(),
});

export const hevySyncState = sqliteTable("hevy_sync_state", {
  user_id: text().primaryKey(),
  event_watermark: text(),
  last_checked_at: text(),
  last_success_at: text(),
  last_data_change_at: text(),
  lease_until: text(),
  last_error_code: text(),
  last_error_at: text(),
});

export const sleepSessions = sqliteTable(
  "sleep_sessions",
  {
    user_id: text().notNull(),
    date: text(),
    start: text(),
    end: text(),
    in_bed_min: integer(),
    asleep_min: integer(),
    awake_min: integer(),
    source: text(),
  },
  (table) => [unique().on(table.user_id, table.date, table.start)],
);

export const bodyMetrics = sqliteTable(
  "body_metrics",
  {
    user_id: text().notNull(),
    date: text().notNull(),
    weight_kg: real(),
    body_fat_pct: real(),
    lean_mass_kg: real(),
    source: text(),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.date] })],
);

export const syncCursors = sqliteTable(
  "sync_cursors",
  {
    user_id: text().notNull(),
    source: text().notNull(),
    last_sync: text(),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.source] })],
);

export const privacyPreferences = sqliteTable("privacy_preferences", {
  user_id: text().primaryKey(),
  rawUploadRetentionDays: integer("raw_upload_retention_days").notNull().default(30),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type DailyActivityRow = Omit<typeof dailyActivity.$inferSelect, "user_id">;
export type HealthWorkoutRow = Omit<typeof healthWorkouts.$inferSelect, "id" | "user_id"> & {
  id?: number;
};
export type HevySessionRow = Omit<typeof hevySessions.$inferSelect, "user_id">;
export type HevySetRow = Omit<typeof hevySets.$inferSelect, "id" | "user_id"> & { id?: number };
export type SleepSessionRow = Omit<typeof sleepSessions.$inferSelect, "user_id">;
export type BodyMetricRow = Omit<typeof bodyMetrics.$inferSelect, "user_id">;
