import * as Effect from "effect/Effect";
import type {
  BodyMetricRow,
  DailyActivityRow,
  HealthWorkoutRow,
  HevySessionRow,
  HevySetRow,
  SleepSessionRow,
} from "./schema.ts";
import { runBatches, type QueryDatabaseClient } from "./client.ts";

type OwnedDailyActivityRow = Omit<DailyActivityRow, "user_id">;
type OwnedHealthWorkoutRow = Omit<HealthWorkoutRow, "user_id">;
type OwnedHevySessionRow = Omit<HevySessionRow, "user_id">;
type OwnedHevySetRow = Omit<HevySetRow, "user_id">;
type OwnedSleepSessionRow = Omit<SleepSessionRow, "user_id">;
type OwnedBodyMetricRow = Omit<BodyMetricRow, "user_id">;

export const upsertDailyActivity = (
  db: QueryDatabaseClient,
  userId: string,
  rows: ReadonlyArray<OwnedDailyActivityRow>,
) =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;

    const statements = rows.map((row) =>
      db
        .prepare(`
        INSERT INTO daily_activity (user_id, date, active_kcal, steps, distance_km, exercise_min, flights_climbed)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET
          active_kcal = excluded.active_kcal,
          steps = excluded.steps,
          distance_km = excluded.distance_km,
          exercise_min = excluded.exercise_min,
          flights_climbed = excluded.flights_climbed
      `)
        .bind(
          userId,
          row.date,
          row.active_kcal,
          row.steps,
          row.distance_km,
          row.exercise_min,
          row.flights_climbed,
        ),
    );

    yield* runBatches(db, statements);
    return rows.length;
  });

export const insertHealthWorkouts = (
  db: QueryDatabaseClient,
  userId: string,
  rows: ReadonlyArray<OwnedHealthWorkoutRow>,
) =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;

    const statements = rows.map((row) =>
      db
        .prepare(`
        INSERT INTO health_workouts (user_id, date, type, start_raw, duration_sec, active_kcal, avg_hr, max_hr, min_hr, distance_km, source, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, date, type, start_raw) DO UPDATE SET
          duration_sec = excluded.duration_sec,
          active_kcal = excluded.active_kcal,
          avg_hr = excluded.avg_hr,
          max_hr = excluded.max_hr,
          min_hr = excluded.min_hr,
          distance_km = excluded.distance_km,
          source = excluded.source,
          raw_json = excluded.raw_json
      `)
        .bind(
          userId,
          row.date,
          row.type,
          row.start_raw,
          row.duration_sec,
          row.active_kcal,
          row.avg_hr,
          row.max_hr,
          row.min_hr,
          row.distance_km,
          row.source,
          row.raw_json,
        ),
    );

    yield* runBatches(db, statements);
    return rows.length;
  });

export const upsertHevySessions = (
  db: QueryDatabaseClient,
  userId: string,
  rows: ReadonlyArray<OwnedHevySessionRow>,
) =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;

    const statements = rows.map((row) =>
      db
        .prepare(`
        INSERT INTO hevy_sessions (user_id, session_id, title, start_time, end_time, duration_sec, total_volume_kg)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, session_id) DO UPDATE SET
          title = excluded.title,
          end_time = excluded.end_time,
          duration_sec = excluded.duration_sec,
          total_volume_kg = excluded.total_volume_kg
      `)
        .bind(
          userId,
          row.session_id,
          row.title,
          row.start_time,
          row.end_time,
          row.duration_sec,
          row.total_volume_kg,
        ),
    );

    yield* runBatches(db, statements);
    return rows.length;
  });

export const upsertHevySets = (
  db: QueryDatabaseClient,
  userId: string,
  rows: ReadonlyArray<OwnedHevySetRow>,
) =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;

    const statements = rows.map((row) =>
      db
        .prepare(`
        INSERT INTO hevy_sets (user_id, session_id, exercise_title, set_index, set_type, weight_kg, reps, rpe, distance_km, duration_seconds, exercise_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, session_id, exercise_title, set_index) DO UPDATE SET
          set_type = excluded.set_type,
          weight_kg = excluded.weight_kg,
          reps = excluded.reps,
          rpe = excluded.rpe,
          distance_km = excluded.distance_km,
          duration_seconds = excluded.duration_seconds,
          exercise_notes = excluded.exercise_notes
      `)
        .bind(
          userId,
          row.session_id,
          row.exercise_title,
          row.set_index,
          row.set_type,
          row.weight_kg,
          row.reps,
          row.rpe,
          row.distance_km,
          row.duration_seconds,
          row.exercise_notes,
        ),
    );

    yield* runBatches(db, statements);
    return rows.length;
  });

export const upsertSleepSessions = (
  db: QueryDatabaseClient,
  userId: string,
  rows: ReadonlyArray<OwnedSleepSessionRow>,
) =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;

    const statements = rows.map((row) =>
      db
        .prepare(`
        INSERT INTO sleep_sessions (user_id, date, start, end, in_bed_min, asleep_min, awake_min, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, date, start) DO UPDATE SET
          end = excluded.end,
          in_bed_min = excluded.in_bed_min,
          asleep_min = excluded.asleep_min,
          awake_min = excluded.awake_min,
          source = excluded.source
      `)
        .bind(
          userId,
          row.date,
          row.start,
          row.end,
          row.in_bed_min,
          row.asleep_min,
          row.awake_min,
          row.source,
        ),
    );

    yield* runBatches(db, statements);
    return rows.length;
  });

export const upsertBodyMetrics = (
  db: QueryDatabaseClient,
  userId: string,
  rows: ReadonlyArray<OwnedBodyMetricRow>,
) =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;

    const statements = rows.map((row) =>
      db
        .prepare(`
        INSERT INTO body_metrics (user_id, date, weight_kg, body_fat_pct, lean_mass_kg, source)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET
          weight_kg = excluded.weight_kg,
          body_fat_pct = excluded.body_fat_pct,
          lean_mass_kg = excluded.lean_mass_kg,
          source = excluded.source
      `)
        .bind(userId, row.date, row.weight_kg, row.body_fat_pct, row.lean_mass_kg, row.source),
    );

    yield* runBatches(db, statements);
    return rows.length;
  });

export const updateSyncCursor = (
  db: QueryDatabaseClient,
  userId: string,
  source: string,
  lastSync: string,
) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`
      INSERT INTO sync_cursors (user_id, source, last_sync)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, source) DO UPDATE SET
        last_sync = excluded.last_sync
    `)
      .bind(userId, source, lastSync)
      .run();
  });

export const getRawUploadRetentionDays = Effect.fn("privacy.readRetention")(function* ({
  db,
  userId,
}: {
  db: QueryDatabaseClient;
  userId: string;
}) {
  const row = yield* db
    .prepare("SELECT raw_upload_retention_days days FROM privacy_preferences WHERE user_id = ?")
    .bind(userId)
    .first<{ days: number }>();
  return row?.days ?? 30;
});

export const updateRawUploadRetentionDays = Effect.fn("privacy.updateRetention")(function* ({
  db,
  userId,
  days,
}: {
  db: QueryDatabaseClient;
  userId: string;
  days: number;
}) {
  yield* db
    .prepare(`
      INSERT INTO privacy_preferences (user_id, raw_upload_retention_days, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        raw_upload_retention_days = excluded.raw_upload_retention_days,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(userId, days)
    .run();
});

export const deleteIngestedSource = Effect.fn("privacy.deleteSource")(function* ({
  db,
  userId,
  source,
}: {
  db: QueryDatabaseClient;
  userId: string;
  source: "health" | "hevy";
}) {
  const tables =
    source === "health"
      ? ["daily_activity", "health_workouts", "sleep_sessions", "body_metrics"]
      : ["hevy_sets", "hevy_sessions"];
  for (const table of tables)
    yield* db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId).run();
  yield* db
    .prepare("DELETE FROM sync_cursors WHERE user_id = ? AND source = ?")
    .bind(userId, source === "health" ? "apple_health" : "hevy")
    .run();
});
