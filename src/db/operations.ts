import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import type {
  BodyMetricRow,
  DailyActivityRow,
  HealthWorkoutRow,
  HevySessionRow,
  HevySetRow,
  SleepSessionRow,
} from "./schema.ts";

export type QueryDatabaseClient = Effect.Success<ReturnType<typeof Cloudflare.D1.QueryDatabase>>;

export const upsertDailyActivity = (
  db: QueryDatabaseClient,
  rows: DailyActivityRow[],
): Effect.Effect<number> =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;

    const statements = rows.map((row) =>
      db.prepare(`
        INSERT INTO daily_activity (date, active_kcal, steps, distance_km, exercise_min, flights_climbed)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          active_kcal = excluded.active_kcal,
          steps = excluded.steps,
          distance_km = excluded.distance_km,
          exercise_min = excluded.exercise_min,
          flights_climbed = excluded.flights_climbed
      `).bind(
        row.date,
        row.active_kcal,
        row.steps,
        row.distance_km,
        row.exercise_min,
        row.flights_climbed,
      )
    );

    yield* db.batch(statements);
    return rows.length;
  });

export const insertHealthWorkouts = (
  db: QueryDatabaseClient,
  rows: HealthWorkoutRow[],
): Effect.Effect<number> =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;

    const statements = rows.map((row) =>
      db.prepare(`
        INSERT INTO health_workouts (date, type, duration_sec, active_kcal, avg_hr, max_hr, min_hr, distance_km, source, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        row.date,
        row.type,
        row.duration_sec,
        row.active_kcal,
        row.avg_hr,
        row.max_hr,
        row.min_hr,
        row.distance_km,
        row.source,
        row.raw_json,
      )
    );

    yield* db.batch(statements);
    return rows.length;
  });

export const upsertHevySessions = (
  db: QueryDatabaseClient,
  rows: HevySessionRow[],
): Effect.Effect<number> =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;

    const statements = rows.map((row) =>
      db.prepare(`
        INSERT INTO hevy_sessions (session_id, title, start_time, end_time, duration_sec, total_volume_kg)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          title = excluded.title,
          end_time = excluded.end_time,
          duration_sec = excluded.duration_sec,
          total_volume_kg = excluded.total_volume_kg
      `).bind(
        row.session_id,
        row.title,
        row.start_time,
        row.end_time,
        row.duration_sec,
        row.total_volume_kg,
      )
    );

    yield* db.batch(statements);
    return rows.length;
  });

export const upsertHevySets = (
  db: QueryDatabaseClient,
  rows: HevySetRow[],
): Effect.Effect<number> =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;

    const statements = rows.map((row) =>
      db.prepare(`
        INSERT INTO hevy_sets (session_id, exercise_title, set_index, set_type, weight_kg, reps, rpe, distance_km, duration_seconds, exercise_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, exercise_title, set_index) DO UPDATE SET
          set_type = excluded.set_type,
          weight_kg = excluded.weight_kg,
          reps = excluded.reps,
          rpe = excluded.rpe,
          distance_km = excluded.distance_km,
          duration_seconds = excluded.duration_seconds,
          exercise_notes = excluded.exercise_notes
      `).bind(
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
      )
    );

    yield* db.batch(statements);
    return rows.length;
  });

export const upsertSleepSessions = (
  db: QueryDatabaseClient,
  rows: SleepSessionRow[],
): Effect.Effect<number> =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;

    const statements = rows.map((row) =>
      db.prepare(`
        INSERT INTO sleep_sessions (date, start, end, in_bed_min, asleep_min, awake_min, source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, start) DO UPDATE SET
          end = excluded.end,
          in_bed_min = excluded.in_bed_min,
          asleep_min = excluded.asleep_min,
          awake_min = excluded.awake_min,
          source = excluded.source
      `).bind(
        row.date,
        row.start,
        row.end,
        row.in_bed_min,
        row.asleep_min,
        row.awake_min,
        row.source,
      )
    );

    yield* db.batch(statements);
    return rows.length;
  });

export const upsertBodyMetrics = (
  db: QueryDatabaseClient,
  rows: BodyMetricRow[],
): Effect.Effect<number> =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;

    const statements = rows.map((row) =>
      db.prepare(`
        INSERT INTO body_metrics (date, weight_kg, body_fat_pct, lean_mass_kg, source)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          weight_kg = excluded.weight_kg,
          body_fat_pct = excluded.body_fat_pct,
          lean_mass_kg = excluded.lean_mass_kg,
          source = excluded.source
      `).bind(
        row.date,
        row.weight_kg,
        row.body_fat_pct,
        row.lean_mass_kg,
        row.source,
      )
    );

    yield* db.batch(statements);
    return rows.length;
  });
