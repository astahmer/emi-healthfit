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

const BATCH_SIZE = 100;

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const runBatches = (
  db: QueryDatabaseClient,
  statements: ReturnType<QueryDatabaseClient["prepare"]>[],
) =>
  Effect.gen(function* () {
    for (const batch of chunk(statements, BATCH_SIZE)) {
      yield* db.batch(batch);
    }
  });

export const upsertDailyActivity = (
  db: QueryDatabaseClient,
  rows: DailyActivityRow[],
) =>
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

    yield* runBatches(db, statements);
    return rows.length;
  });

export const insertHealthWorkouts = (
  db: QueryDatabaseClient,
  rows: HealthWorkoutRow[],
) =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;

    const statements = rows.map((row) =>
      db.prepare(`
        INSERT INTO health_workouts (date, type, start_raw, duration_sec, active_kcal, avg_hr, max_hr, min_hr, distance_km, source, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, type, start_raw) DO UPDATE SET
          duration_sec = excluded.duration_sec,
          active_kcal = excluded.active_kcal,
          avg_hr = excluded.avg_hr,
          max_hr = excluded.max_hr,
          min_hr = excluded.min_hr,
          distance_km = excluded.distance_km,
          source = excluded.source,
          raw_json = excluded.raw_json
      `).bind(
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
      )
    );

    yield* runBatches(db, statements);
    return rows.length;
  });

export const upsertHevySessions = (
  db: QueryDatabaseClient,
  rows: HevySessionRow[],
) =>
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

    yield* runBatches(db, statements);
    return rows.length;
  });

export const upsertHevySets = (
  db: QueryDatabaseClient,
  rows: HevySetRow[],
) =>
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

    yield* runBatches(db, statements);
    return rows.length;
  });

export const upsertSleepSessions = (
  db: QueryDatabaseClient,
  rows: SleepSessionRow[],
) =>
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

    yield* runBatches(db, statements);
    return rows.length;
  });

export const upsertBodyMetrics = (
  db: QueryDatabaseClient,
  rows: BodyMetricRow[],
) =>
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

    yield* runBatches(db, statements);
    return rows.length;
  });

export const updateSyncCursor = (
  db: QueryDatabaseClient,
  source: string,
  lastSync: string,
) =>
  Effect.gen(function* () {
    yield* db.prepare(`
      INSERT INTO sync_cursors (source, last_sync)
      VALUES (?, ?)
      ON CONFLICT(source) DO UPDATE SET
        last_sync = excluded.last_sync
    `).bind(source, lastSync).run();
  });

export interface DataSummary {
  dailyActivity: number;
  healthWorkouts: number;
  hevySessions: number;
  hevySets: number;
  sleepSessions: number;
  bodyMetrics: number;
  lastHealthSync: string | null;
  lastHevySync: string | null;
}

export const getDataSummary = (db: QueryDatabaseClient) =>
  Effect.gen(function* () {
    const [daily, workouts, sessions, sets, sleep, body, cursors] = yield* Effect.all([
      db.prepare("SELECT COUNT(*) as c FROM daily_activity").first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) as c FROM health_workouts").first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) as c FROM hevy_sessions").first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) as c FROM hevy_sets").first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) as c FROM sleep_sessions").first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) as c FROM body_metrics").first<{ c: number }>(),
      db.prepare("SELECT source, last_sync FROM sync_cursors").all<{ source: string; last_sync: string }>(),
    ]);

    const cursorMap = new Map(cursors.results.map((row) => [row.source, row.last_sync]));

    return {
      dailyActivity: daily?.c ?? 0,
      healthWorkouts: workouts?.c ?? 0,
      hevySessions: sessions?.c ?? 0,
      hevySets: sets?.c ?? 0,
      sleepSessions: sleep?.c ?? 0,
      bodyMetrics: body?.c ?? 0,
      lastHealthSync: cursorMap.get("apple_health") ?? null,
      lastHevySync: cursorMap.get("hevy") ?? null,
    } satisfies DataSummary;
  });
