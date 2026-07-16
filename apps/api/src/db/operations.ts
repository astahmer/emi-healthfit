import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { getRevisionDeletionIds } from "../chat/conversation-revision.ts";
import type {
  BodyMetricRow,
  DailyActivityRow,
  HealthWorkoutRow,
  HevySessionRow,
  HevySetRow,
  MemoryRow,
  NoteRow,
  SleepSessionRow,
  SuggestionsRow,
} from "./schema.ts";

export type QueryDatabaseClient = Effect.Success<ReturnType<typeof Cloudflare.D1.QueryDatabase>>;
type OwnedDailyActivityRow = Omit<DailyActivityRow, "user_id">;
type OwnedHealthWorkoutRow = Omit<HealthWorkoutRow, "user_id">;
type OwnedHevySessionRow = Omit<HevySessionRow, "user_id">;
type OwnedHevySetRow = Omit<HevySetRow, "user_id">;
type OwnedSleepSessionRow = Omit<SleepSessionRow, "user_id">;
type OwnedBodyMetricRow = Omit<BodyMetricRow, "user_id">;

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

const textEncoder = new TextEncoder();

const arrayBufferToHex = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const requireMappedId = (ids: Map<string, string>, originalId: string): string => {
  const id = ids.get(originalId);
  if (id === undefined) throw new Error(`Missing cloned id for ${originalId}`);
  return id;
};

export const hashSuggestionsKey = (
  lastAssistantText: string,
  lastUserText?: string,
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const input = `${lastAssistantText}\0${lastUserText ?? ""}`;
    const buffer = yield* Effect.promise(() =>
      crypto.subtle.digest("SHA-256", textEncoder.encode(input)),
    );
    return arrayBufferToHex(buffer);
  });

export const upsertDailyActivity = (
  db: QueryDatabaseClient,
  userId: string,
  rows: OwnedDailyActivityRow[],
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
  rows: OwnedHealthWorkoutRow[],
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
  rows: OwnedHevySessionRow[],
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

export const upsertHevySets = (db: QueryDatabaseClient, userId: string, rows: OwnedHevySetRow[]) =>
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
  rows: OwnedSleepSessionRow[],
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
  rows: OwnedBodyMetricRow[],
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

export interface WorkoutHistoryItem {
  session_id: string;
  title: string | null;
  start_time: string;
  total_volume_kg: number | null;
  exercise_count: number;
  set_count: number;
}

export const getWorkoutHistory = (db: QueryDatabaseClient, userId: string, limit = 10) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT
        s.session_id,
        s.title,
        s.start_time,
        s.total_volume_kg,
        COUNT(DISTINCT st.exercise_title) as exercise_count,
        COUNT(st.set_index) as set_count
      FROM hevy_sessions s
      LEFT JOIN hevy_sets st ON st.user_id = s.user_id AND st.session_id = s.session_id
      WHERE s.user_id = ?
      GROUP BY s.session_id
      ORDER BY s.start_time DESC
      LIMIT ?
    `)
      .bind(userId, limit)
      .all<WorkoutHistoryItem>();

    return result.results;
  });

interface WorkoutDetailSetRow {
  session_id: string;
  session_title: string | null;
  start_time: string;
  end_time: string | null;
  duration_sec: number | null;
  session_volume_kg: number | null;
  exercise_title: string;
  set_index: number;
  set_type: string | null;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
}

export const getWorkoutDetails = Effect.fn("workout.details")(function* ({
  db,
  userId,
  sessionId,
}: {
  db: QueryDatabaseClient;
  userId: string;
  sessionId: string;
}) {
  const result = yield* db
    .prepare(`
      SELECT
        s.session_id,
        s.title AS session_title,
        s.start_time,
        s.end_time,
        s.duration_sec,
        s.total_volume_kg AS session_volume_kg,
        st.exercise_title,
        st.set_index,
        st.set_type,
        st.weight_kg,
        st.reps,
        st.rpe
      FROM hevy_sessions s
      JOIN hevy_sets st ON st.user_id = s.user_id AND st.session_id = s.session_id
      WHERE s.user_id = ? AND s.session_id = ?
      ORDER BY st.exercise_title, st.set_index
    `)
    .bind(userId, sessionId)
    .all<WorkoutDetailSetRow>();
  const first = result.results[0];
  if (first === undefined) return null;

  const exerciseMap = new Map<
    string,
    { title: string; volumeKg: number; sets: Array<Omit<WorkoutDetailSetRow, "exercise_title">> }
  >();
  for (const row of result.results) {
    const exercise = exerciseMap.get(row.exercise_title) ?? {
      title: row.exercise_title,
      volumeKg: 0,
      sets: [],
    };
    exercise.sets.push({
      session_id: row.session_id,
      session_title: row.session_title,
      start_time: row.start_time,
      end_time: row.end_time,
      duration_sec: row.duration_sec,
      session_volume_kg: row.session_volume_kg,
      set_index: row.set_index,
      set_type: row.set_type,
      weight_kg: row.weight_kg,
      reps: row.reps,
      rpe: row.rpe,
    });
    exercise.volumeKg += (row.weight_kg ?? 0) * (row.reps ?? 0);
    exerciseMap.set(row.exercise_title, exercise);
  }

  return {
    sessionId: first.session_id,
    title: first.session_title,
    startTime: first.start_time,
    endTime: first.end_time,
    durationSeconds: first.duration_sec,
    totalVolumeKg:
      first.session_volume_kg ??
      [...exerciseMap.values()].reduce((total, exercise) => total + exercise.volumeKg, 0),
    exercises: [...exerciseMap.values()],
  };
});

export interface ExerciseProgressSet {
  session_id: string;
  title: string | null;
  start_time: string;
  max_weight_kg: number | null;
  max_volume_kg: number | null;
  total_volume_kg: number | null;
  total_reps: number | null;
  sets: number;
}

interface ExerciseProgress {
  exercise_title: string;
  weeks: number;
  workouts: ExerciseProgressSet[];
  personalRecord: {
    weight_kg: number | null;
    reps: number | null;
    volume_kg: number | null;
  };
}

const isoDateDaysAgo = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

export const getExerciseProgress = (
  db: QueryDatabaseClient,
  userId: string,
  exerciseTitle: string,
  weeks = 8,
) =>
  Effect.gen(function* () {
    const since = isoDateDaysAgo(weeks * 7);

    const workouts = yield* db
      .prepare(`
      SELECT
        s.session_id,
        s.title,
        s.start_time,
        MAX(st.weight_kg) as max_weight_kg,
        MAX(st.weight_kg * st.reps) as max_volume_kg,
        SUM(st.weight_kg * st.reps) as total_volume_kg,
        SUM(st.reps) as total_reps,
        COUNT(*) as sets
      FROM hevy_sets st
      JOIN hevy_sessions s ON s.user_id = st.user_id AND s.session_id = st.session_id
      WHERE st.user_id = ? AND st.exercise_title = ? AND s.start_time >= ?
      GROUP BY s.session_id
      ORDER BY s.start_time ASC
    `)
      .bind(userId, exerciseTitle, since)
      .all<ExerciseProgressSet>();

    const prRow = yield* db
      .prepare(`
      SELECT
        MAX(weight_kg) as pr_weight_kg,
        MAX(weight_kg * reps) as pr_volume_kg
      FROM hevy_sets
      WHERE user_id = ? AND exercise_title = ? AND weight_kg IS NOT NULL AND reps IS NOT NULL
    `)
      .bind(userId, exerciseTitle)
      .first<{ pr_weight_kg: number | null; pr_volume_kg: number | null }>();

    const prSet = yield* db
      .prepare(`
      SELECT weight_kg, reps
      FROM hevy_sets
      WHERE user_id = ? AND exercise_title = ? AND weight_kg IS NOT NULL AND reps IS NOT NULL
      ORDER BY weight_kg * reps DESC
      LIMIT 1
    `)
      .bind(userId, exerciseTitle)
      .first<{ weight_kg: number | null; reps: number | null }>();

    return {
      exercise_title: exerciseTitle,
      weeks,
      workouts: workouts.results,
      personalRecord: {
        weight_kg: prSet?.weight_kg ?? null,
        reps: prSet?.reps ?? null,
        volume_kg: prRow?.pr_volume_kg ?? null,
      },
    } satisfies ExerciseProgress;
  });

interface SleepTrend {
  days: number;
  avg_in_bed_min: number | null;
  avg_asleep_min: number | null;
  avg_awake_min: number | null;
  avg_sleep_hours: number | null;
}

export const getSleepTrend = (db: QueryDatabaseClient, userId: string, days = 7) =>
  Effect.gen(function* () {
    const since = isoDateDaysAgo(days);
    const row = yield* db
      .prepare(`
      SELECT
        COUNT(*) as days,
        AVG(in_bed_min) as avg_in_bed_min,
        AVG(asleep_min) as avg_asleep_min,
        AVG(awake_min) as avg_awake_min
      FROM sleep_sessions
      WHERE user_id = ? AND date >= ?
    `)
      .bind(userId, since)
      .first<{
        days: number;
        avg_in_bed_min: number | null;
        avg_asleep_min: number | null;
        avg_awake_min: number | null;
      }>();

    const asleepMin = row?.avg_asleep_min ?? null;

    return {
      days: row?.days ?? 0,
      avg_in_bed_min: row?.avg_in_bed_min ?? null,
      avg_asleep_min: asleepMin,
      avg_awake_min: row?.avg_awake_min ?? null,
      avg_sleep_hours: asleepMin !== null ? Number((asleepMin / 60).toFixed(2)) : null,
    } satisfies SleepTrend;
  });

interface WorkoutStreak {
  current_streak: number;
  longest_streak: number;
  last_workout_date: string | null;
}

const computeStreaks = (
  dates: string[],
): { current: number; longest: number; last: string | null } => {
  if (dates.length === 0) return { current: 0, longest: 0, last: null };

  const sorted = [...new Set(dates)].sort();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  let longest = 1;
  let current = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  const last = sorted[sorted.length - 1];
  const currentStreak = last === today || last === yesterdayStr ? current : 0;

  return { current: currentStreak, longest, last };
};

export const getWorkoutStreak = (db: QueryDatabaseClient, userId: string) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT DISTINCT date(start_time) as workout_date
      FROM hevy_sessions
      WHERE user_id = ?
      ORDER BY workout_date ASC
    `)
      .bind(userId)
      .all<{ workout_date: string }>();

    const streaks = computeStreaks(result.results.map((row) => row.workout_date));

    return {
      current_streak: streaks.current,
      longest_streak: streaks.longest,
      last_workout_date: streaks.last,
    } satisfies WorkoutStreak;
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

export const getDataSummary = (db: QueryDatabaseClient, userId: string) =>
  Effect.gen(function* () {
    const [daily, workouts, sessions, sets, sleep, body, cursors] = yield* Effect.all([
      db
        .prepare("SELECT COUNT(*) as c FROM daily_activity WHERE user_id = ?")
        .bind(userId)
        .first<{ c: number }>(),
      db
        .prepare("SELECT COUNT(*) as c FROM health_workouts WHERE user_id = ?")
        .bind(userId)
        .first<{ c: number }>(),
      db
        .prepare("SELECT COUNT(*) as c FROM hevy_sessions WHERE user_id = ?")
        .bind(userId)
        .first<{ c: number }>(),
      db
        .prepare("SELECT COUNT(*) as c FROM hevy_sets WHERE user_id = ?")
        .bind(userId)
        .first<{ c: number }>(),
      db
        .prepare("SELECT COUNT(*) as c FROM sleep_sessions WHERE user_id = ?")
        .bind(userId)
        .first<{ c: number }>(),
      db
        .prepare("SELECT COUNT(*) as c FROM body_metrics WHERE user_id = ?")
        .bind(userId)
        .first<{ c: number }>(),
      db
        .prepare("SELECT source, last_sync FROM sync_cursors WHERE user_id = ?")
        .bind(userId)
        .all<{ source: string; last_sync: string }>(),
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

export const getIngestedDataExport = Effect.fn("dataExport.readIngested")(function* ({
  db,
  userId,
}: {
  db: QueryDatabaseClient;
  userId: string;
}) {
  const [
    dailyActivity,
    healthWorkouts,
    hevySessions,
    hevySets,
    sleepSessions,
    bodyMetrics,
    cursors,
  ] = yield* Effect.all([
    db
      .prepare("SELECT * FROM daily_activity WHERE user_id = ? ORDER BY date")
      .bind(userId)
      .all<DailyActivityRow>(),
    db
      .prepare("SELECT * FROM health_workouts WHERE user_id = ? ORDER BY date, id")
      .bind(userId)
      .all<HealthWorkoutRow>(),
    db
      .prepare("SELECT * FROM hevy_sessions WHERE user_id = ? ORDER BY start_time, session_id")
      .bind(userId)
      .all<HevySessionRow>(),
    db
      .prepare(
        "SELECT * FROM hevy_sets WHERE user_id = ? ORDER BY session_id, exercise_title, set_index",
      )
      .bind(userId)
      .all<HevySetRow>(),
    db
      .prepare("SELECT * FROM sleep_sessions WHERE user_id = ? ORDER BY date, start")
      .bind(userId)
      .all<SleepSessionRow>(),
    db
      .prepare("SELECT * FROM body_metrics WHERE user_id = ? ORDER BY date")
      .bind(userId)
      .all<BodyMetricRow>(),
    db
      .prepare("SELECT source, last_sync FROM sync_cursors WHERE user_id = ? ORDER BY source")
      .bind(userId)
      .all<{ source: string; last_sync: string | null }>(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    health: {
      dailyActivity: dailyActivity.results,
      workouts: healthWorkouts.results,
      sleepSessions: sleepSessions.results,
      bodyMetrics: bodyMetrics.results,
    },
    hevy: {
      sessions: hevySessions.results,
      sets: hevySets.results,
    },
    syncCursors: cursors.results,
  };
});

interface ExportRange {
  count: number;
  first: string | null;
  last: string | null;
}

export const getIngestedDataExportSummary = Effect.fn("dataExport.readSummary")(function* ({
  db,
  userId,
}: {
  db: QueryDatabaseClient;
  userId: string;
}) {
  const [activity, workouts, sleep, body, hevySessions, hevySets] = yield* Effect.all([
    db
      .prepare(
        "SELECT COUNT(*) count, MIN(date) first, MAX(date) last FROM daily_activity WHERE user_id = ?",
      )
      .bind(userId)
      .first<ExportRange>(),
    db
      .prepare(
        "SELECT COUNT(*) count, MIN(date) first, MAX(date) last FROM health_workouts WHERE user_id = ?",
      )
      .bind(userId)
      .first<ExportRange>(),
    db
      .prepare(
        "SELECT COUNT(*) count, MIN(date) first, MAX(date) last FROM sleep_sessions WHERE user_id = ?",
      )
      .bind(userId)
      .first<ExportRange>(),
    db
      .prepare(
        "SELECT COUNT(*) count, MIN(date) first, MAX(date) last FROM body_metrics WHERE user_id = ?",
      )
      .bind(userId)
      .first<ExportRange>(),
    db
      .prepare(
        "SELECT COUNT(*) count, MIN(start_time) first, MAX(start_time) last FROM hevy_sessions WHERE user_id = ?",
      )
      .bind(userId)
      .first<ExportRange>(),
    db
      .prepare("SELECT COUNT(*) count FROM hevy_sets WHERE user_id = ?")
      .bind(userId)
      .first<{ count: number }>(),
  ]);
  const emptyRange: ExportRange = { count: 0, first: null, last: null };
  const sources = {
    dailyActivity: activity ?? emptyRange,
    healthWorkouts: workouts ?? emptyRange,
    sleepSessions: sleep ?? emptyRange,
    bodyMetrics: body ?? emptyRange,
    hevySessions: hevySessions ?? emptyRange,
    hevySets: { count: hevySets?.count ?? 0, first: null, last: null },
  };
  return {
    sources,
    totalRecords: Object.values(sources).reduce((total, source) => total + source.count, 0),
    healthRange: {
      first:
        [sources.dailyActivity.first, sources.healthWorkouts.first, sources.sleepSessions.first]
          .filter((value) => value !== null)
          .toSorted()[0] ?? null,
      last:
        [sources.dailyActivity.last, sources.healthWorkouts.last, sources.sleepSessions.last]
          .filter((value) => value !== null)
          .toSorted()
          .at(-1) ?? null,
    },
    hevyRange: { first: sources.hevySessions.first, last: sources.hevySessions.last },
  };
});

export const getAnalyticsOverview = Effect.fn("analytics.overview")(function* ({
  db,
  userId,
  days = 90,
}: {
  db: QueryDatabaseClient;
  userId: string;
  days?: number;
}) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const [activity, sleep, body, training, exercises] = yield* Effect.all([
    db
      .prepare(
        "SELECT date, steps, active_kcal, exercise_min FROM daily_activity WHERE user_id = ? AND date >= ? ORDER BY date",
      )
      .bind(userId, since)
      .all<{
        date: string;
        steps: number | null;
        active_kcal: number | null;
        exercise_min: number | null;
      }>(),
    db
      .prepare(
        "SELECT date, SUM(asleep_min) asleep_min, SUM(in_bed_min) in_bed_min FROM sleep_sessions WHERE user_id = ? AND date >= ? GROUP BY date ORDER BY date",
      )
      .bind(userId, since)
      .all<{ date: string; asleep_min: number | null; in_bed_min: number | null }>(),
    db
      .prepare(
        "SELECT date, weight_kg, body_fat_pct, lean_mass_kg FROM body_metrics WHERE user_id = ? AND date >= ? ORDER BY date",
      )
      .bind(userId, since)
      .all<{
        date: string;
        weight_kg: number | null;
        body_fat_pct: number | null;
        lean_mass_kg: number | null;
      }>(),
    db
      .prepare(
        "SELECT substr(start_time, 1, 10) date, COUNT(*) workouts, SUM(total_volume_kg) volume_kg, SUM(duration_sec) duration_sec FROM hevy_sessions WHERE user_id = ? AND start_time >= ? GROUP BY substr(start_time, 1, 10) ORDER BY date",
      )
      .bind(userId, since)
      .all<{
        date: string;
        workouts: number;
        volume_kg: number | null;
        duration_sec: number | null;
      }>(),
    db
      .prepare(
        "SELECT s.exercise_title, COUNT(*) sets, SUM(COALESCE(s.weight_kg, 0) * COALESCE(s.reps, 0)) volume_kg FROM hevy_sets s JOIN hevy_sessions h ON h.user_id = s.user_id AND h.session_id = s.session_id WHERE s.user_id = ? AND h.start_time >= ? GROUP BY s.exercise_title ORDER BY sets DESC LIMIT 8",
      )
      .bind(userId, since)
      .all<{ exercise_title: string; sets: number; volume_kg: number }>(),
  ]);
  const average = (values: number[]) =>
    values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;
  const weights = body.results.flatMap((row) => (row.weight_kg === null ? [] : [row.weight_kg]));
  return {
    days,
    activity: activity.results,
    sleep: sleep.results,
    body: body.results,
    training: training.results,
    exercises: exercises.results,
    highlights: {
      averageSteps: average(
        activity.results.flatMap((row) => (row.steps === null ? [] : [row.steps])),
      ),
      averageSleepMinutes: average(
        sleep.results.flatMap((row) => {
          const minutes = row.asleep_min ?? row.in_bed_min;
          return minutes === null ? [] : [minutes];
        }),
      ),
      workouts: training.results.reduce((total, row) => total + row.workouts, 0),
      trainingVolumeKg: training.results.reduce((total, row) => total + (row.volume_kg ?? 0), 0),
      weightChangeKg: weights.length < 2 ? null : (weights.at(-1) ?? 0) - (weights.at(0) ?? 0),
    },
  };
});

export interface WorkoutSession {
  session_id: string;
  title: string | null;
  start_time: string;
  end_time: string | null;
  duration_sec: number | null;
  total_volume_kg: number | null;
  sets: number;
  exercises: number;
}

export interface WorkoutSet {
  set_index: number;
  set_type: string | null;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  distance_km: number | null;
  duration_seconds: number | null;
  exercise_notes: string | null;
}

interface WorkoutExercise {
  exercise_title: string;
  sets: WorkoutSet[];
}

interface WorkoutSessionDetail extends WorkoutSession {
  exerciseDetails: WorkoutExercise[];
}

export const getWorkouts = (db: QueryDatabaseClient, userId: string) =>
  Effect.gen(function* () {
    const sessions = yield* db
      .prepare(`
      SELECT
        s.session_id,
        s.title,
        s.start_time,
        s.end_time,
        s.duration_sec,
        s.total_volume_kg,
        COUNT(st.id) as sets,
        COUNT(DISTINCT st.exercise_title) as exercises
      FROM hevy_sessions s
      LEFT JOIN hevy_sets st ON st.user_id = s.user_id AND st.session_id = s.session_id
      WHERE s.user_id = ?
      GROUP BY s.session_id
      ORDER BY s.start_time DESC
    `)
      .bind(userId)
      .all<WorkoutSession>();

    const sets = yield* db
      .prepare(`
      SELECT
        session_id,
        exercise_title,
        set_index,
        set_type,
        weight_kg,
        reps,
        rpe,
        distance_km,
        duration_seconds,
        exercise_notes
      FROM hevy_sets
      WHERE user_id = ?
      ORDER BY session_id, exercise_title, set_index
    `)
      .bind(userId)
      .all<HevySetRow>();

    const setsBySession = new Map<string, HevySetRow[]>();
    for (const set of sets.results) {
      const list = setsBySession.get(set.session_id);
      if (list === undefined) {
        setsBySession.set(set.session_id, [set]);
      } else {
        list.push(set);
      }
    }

    return sessions.results.map((session) => {
      const sessionSets = setsBySession.get(session.session_id) ?? [];
      const exercisesByTitle = new Map<string, WorkoutSet[]>();
      for (const set of sessionSets) {
        const list = exercisesByTitle.get(set.exercise_title);
        const mapped: WorkoutSet = {
          set_index: set.set_index,
          set_type: set.set_type,
          weight_kg: set.weight_kg,
          reps: set.reps,
          rpe: set.rpe,
          distance_km: set.distance_km,
          duration_seconds: set.duration_seconds,
          exercise_notes: set.exercise_notes,
        };
        if (list === undefined) {
          exercisesByTitle.set(set.exercise_title, [mapped]);
        } else {
          list.push(mapped);
        }
      }

      const exercises: WorkoutExercise[] = [];
      for (const [exercise_title, exerciseSets] of exercisesByTitle) {
        exercises.push({ exercise_title, sets: exerciseSets });
      }

      return { ...session, exerciseDetails: exercises } satisfies WorkoutSessionDetail;
    });
  });

export interface Conversation {
  id: string;
  title: string | null;
  status: "regular" | "archived";
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageUsage {
  prompt_tokens?: number | undefined;
  completion_tokens?: number | undefined;
  total_tokens?: number | undefined;
}

export interface Message {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: string;
  parts: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  model: string | null;
  created_at: string;
}

export interface Thread {
  id: string;
  conversation_id: string;
  anchor_message_id: string;
  title: string | null;
  status: "regular" | "discarded" | "merged";
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

const nowIso = (): string => new Date().toISOString();

export const createConversation = (db: QueryDatabaseClient, userId: string, title?: string) =>
  Effect.gen(function* () {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    yield* db
      .prepare(`
      INSERT INTO conversations (id, user_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
      .bind(id, userId, title ?? null, "regular", createdAt, createdAt)
      .run();
    return id;
  });

export const getConversations = (db: QueryDatabaseClient, userId: string, search?: string) =>
  Effect.gen(function* () {
    if (search !== undefined && search.trim() !== "") {
      const term = `%${search.trim()}%`;
      const result = yield* db
        .prepare(`
        SELECT DISTINCT c.*
        FROM conversations c
        LEFT JOIN messages m ON m.user_id = c.user_id AND m.conversation_id = c.id
        WHERE c.user_id = ? AND c.status IN ('regular', 'archived') AND (c.title LIKE ? OR m.parts LIKE ?)
        ORDER BY c.status = 'archived', c.pinned DESC, c.updated_at DESC
        LIMIT 100
      `)
        .bind(userId, term, term)
        .all<Conversation>();
      return result.results;
    }

    const result = yield* db
      .prepare(`
      SELECT * FROM conversations
      WHERE user_id = ? AND status IN ('regular', 'archived')
      ORDER BY status = 'archived', pinned DESC, updated_at DESC
      LIMIT 100
    `)
      .bind(userId)
      .all<Conversation>();
    return result.results;
  });

export const getConversation = (db: QueryDatabaseClient, userId: string, conversationId: string) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT * FROM conversations WHERE user_id = ? AND id = ?
    `)
      .bind(userId, conversationId)
      .first<Conversation>();
    return result ?? null;
  });

export const deleteConversation = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`DELETE FROM conversations WHERE user_id = ? AND id = ?`)
      .bind(userId, conversationId)
      .run();
  });

export const updateConversationState = Effect.fn("conversation.updateState")(function* ({
  db,
  userId,
  conversationId,
  status,
  pinned,
}: {
  db: QueryDatabaseClient;
  userId: string;
  conversationId: string;
  status?: "regular" | "archived";
  pinned?: boolean;
}) {
  if (status !== undefined) {
    yield* db
      .prepare("UPDATE conversations SET status = ?, updated_at = ? WHERE user_id = ? AND id = ?")
      .bind(status, nowIso(), userId, conversationId)
      .run();
  }
  if (pinned !== undefined) {
    yield* db
      .prepare("UPDATE conversations SET pinned = ?, updated_at = ? WHERE user_id = ? AND id = ?")
      .bind(pinned ? 1 : 0, nowIso(), userId, conversationId)
      .run();
  }
});

export const cloneConversation = Effect.fn("conversation.clone")(function* ({
  db,
  userId,
  conversationId,
}: {
  db: QueryDatabaseClient;
  userId: string;
  conversationId: string;
}) {
  const conversation = yield* getConversation(db, userId, conversationId);
  if (conversation === null) return null;
  const originalMessages = yield* getConversationMessages(db, userId, conversationId);
  const originalThreads = yield* getThreadsIncludingDiscarded(db, userId, conversationId);
  const threadMessageRows = yield* db
    .prepare(
      "SELECT tm.thread_id, tm.message_id, tm.included_at FROM thread_messages tm JOIN threads t ON t.user_id = tm.user_id AND t.id = tm.thread_id WHERE tm.user_id = ? AND t.conversation_id = ?",
    )
    .bind(userId, conversationId)
    .all<{ thread_id: string; message_id: string; included_at: string }>();
  const clonedConversationId = crypto.randomUUID();
  const timestamp = nowIso();
  const messageIds = new Map(originalMessages.map((message) => [message.id, crypto.randomUUID()]));
  const threadIds = new Map(originalThreads.map((thread) => [thread.id, crypto.randomUUID()]));

  yield* db
    .prepare(
      "INSERT INTO conversations (id, user_id, title, status, pinned, created_at, updated_at) VALUES (?, ?, ?, 'regular', 0, ?, ?)",
    )
    .bind(
      clonedConversationId,
      userId,
      `${conversation.title ?? "New chat"} copy`,
      timestamp,
      timestamp,
    )
    .run();
  yield* runBatches(
    db,
    originalMessages.map((message) =>
      db
        .prepare(
          "INSERT INTO messages (id, user_id, conversation_id, parent_id, role, parts, prompt_tokens, completion_tokens, total_tokens, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          requireMappedId(messageIds, message.id),
          userId,
          clonedConversationId,
          message.parent_id === null ? null : (messageIds.get(message.parent_id) ?? null),
          message.role,
          message.parts,
          message.prompt_tokens,
          message.completion_tokens,
          message.total_tokens,
          message.model,
          message.created_at,
        ),
    ),
  );
  yield* runBatches(
    db,
    originalThreads.map((thread) =>
      db
        .prepare(
          "INSERT INTO threads (id, user_id, conversation_id, anchor_message_id, title, status, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          requireMappedId(threadIds, thread.id),
          userId,
          clonedConversationId,
          requireMappedId(messageIds, thread.anchor_message_id),
          thread.title,
          thread.status,
          thread.pinned ? 1 : 0,
          thread.created_at,
          thread.updated_at,
        ),
    ),
  );
  yield* runBatches(
    db,
    threadMessageRows.results.flatMap((row) => {
      const threadId = threadIds.get(row.thread_id);
      const messageId = messageIds.get(row.message_id);
      if (threadId === undefined || messageId === undefined) return [];
      return [
        db
          .prepare(
            "INSERT INTO thread_messages (user_id, thread_id, message_id, included_at) VALUES (?, ?, ?, ?)",
          )
          .bind(userId, threadId, messageId, row.included_at),
      ];
    }),
  );
  return yield* getConversation(db, userId, clonedConversationId);
});

export const renameConversation = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
  title: string,
) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`
      UPDATE conversations SET title = ?, updated_at = ? WHERE user_id = ? AND id = ?
    `)
      .bind(title, nowIso(), userId, conversationId)
      .run();
  });

const updateConversationTimestamp = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`
      UPDATE conversations SET updated_at = ? WHERE user_id = ? AND id = ?
    `)
      .bind(nowIso(), userId, conversationId)
      .run();
  });

export const getConversationMessages = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT id, conversation_id, parent_id, role, parts, prompt_tokens, completion_tokens, total_tokens, model, created_at
      FROM messages
      WHERE user_id = ? AND conversation_id = ?
      ORDER BY created_at ASC
    `)
      .bind(userId, conversationId)
      .all<Message>();
    return result.results;
  });

export const reviseConversationMessage = Effect.fn("conversation.reviseMessage")(function* ({
  db,
  userId,
  conversationId,
  messageId,
  parts,
  threadId,
}: {
  db: QueryDatabaseClient;
  userId: string;
  conversationId: string;
  messageId: string;
  parts: unknown[];
  threadId?: string;
}) {
  const conversationRows = yield* getConversationMessages(db, userId, conversationId);
  const message = conversationRows.find((row) => row.id === messageId);
  if (message === undefined || message.role !== "user") return false;

  const scopedRows =
    threadId === undefined
      ? conversationRows.filter((row) => row.parent_id === null)
      : yield* getThreadMessages(db, userId, threadId);
  const messageIndex = scopedRows.findIndex((row) => row.id === messageId);
  if (messageIndex < 0) return false;

  const deletedMessageIds = getRevisionDeletionIds({
    conversationRows,
    scopedRows,
    messageId,
    includeDescendants: threadId === undefined,
  });

  const statements = [
    db
      .prepare(
        "UPDATE messages SET parts = ?, prompt_tokens = NULL, completion_tokens = NULL, total_tokens = NULL, model = NULL WHERE user_id = ? AND id = ? AND conversation_id = ?",
      )
      .bind(JSON.stringify(parts), userId, messageId, conversationId),
    ...deletedMessageIds.map((deletedMessageId) =>
      db
        .prepare("DELETE FROM messages WHERE user_id = ? AND id = ?")
        .bind(userId, deletedMessageId),
    ),
  ];
  yield* runBatches(db, statements);
  yield* updateConversationTimestamp(db, userId, conversationId);
  return true;
});

export const saveConversationMessages = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
  parentId: string | null,
  messages: Array<{ role: string; parts: unknown[]; usage?: MessageUsage; model?: string }>,
) =>
  Effect.gen(function* () {
    if (messages.length === 0) return [];

    const createdAt = nowIso();
    const ids: string[] = [];
    const statements = messages.map((message) => {
      const id = crypto.randomUUID();
      ids.push(id);
      return db
        .prepare(`
        INSERT INTO messages (id, user_id, conversation_id, parent_id, role, parts, prompt_tokens, completion_tokens, total_tokens, model, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          id,
          userId,
          conversationId,
          parentId,
          message.role,
          JSON.stringify(message.parts),
          message.usage?.prompt_tokens ?? null,
          message.usage?.completion_tokens ?? null,
          message.usage?.total_tokens ?? null,
          message.model ?? null,
          createdAt,
        );
    });

    yield* runBatches(db, statements);
    yield* updateConversationTimestamp(db, userId, conversationId);
    return ids;
  });

export const createThread = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
  anchorMessageId: string,
  title?: string,
) =>
  Effect.gen(function* () {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    yield* db
      .prepare(`
      INSERT INTO threads (id, user_id, conversation_id, anchor_message_id, title, status, pinned, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        id,
        userId,
        conversationId,
        anchorMessageId,
        title ?? null,
        "regular",
        0,
        createdAt,
        createdAt,
      )
      .run();
    yield* addThreadMessage(db, userId, id, anchorMessageId);
    return id;
  });

interface ThreadRow {
  id: string;
  conversation_id: string;
  anchor_message_id: string;
  title: string | null;
  status: Thread["status"];
  pinned: number;
  created_at: string;
  updated_at: string;
}

const mapThreadRow = (row: ThreadRow): Thread => ({
  id: row.id,
  conversation_id: row.conversation_id,
  anchor_message_id: row.anchor_message_id,
  title: row.title,
  status: row.status,
  pinned: row.pinned === 1,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const getThreads = (db: QueryDatabaseClient, userId: string, conversationId: string) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT * FROM threads
      WHERE user_id = ? AND conversation_id = ? AND status != 'discarded'
      ORDER BY pinned DESC, updated_at DESC
    `)
      .bind(userId, conversationId)
      .all<ThreadRow>();
    return result.results.map(mapThreadRow);
  });

export const getThreadsIncludingDiscarded = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT * FROM threads
      WHERE user_id = ? AND conversation_id = ?
      ORDER BY pinned DESC, updated_at DESC
    `)
      .bind(userId, conversationId)
      .all<ThreadRow>();
    return result.results.map(mapThreadRow);
  });

export const getThread = (db: QueryDatabaseClient, userId: string, threadId: string) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT * FROM threads WHERE user_id = ? AND id = ?
    `)
      .bind(userId, threadId)
      .first<ThreadRow>();
    return result === null ? null : mapThreadRow(result);
  });

export const renameThread = (
  db: QueryDatabaseClient,
  userId: string,
  threadId: string,
  title: string,
) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`
      UPDATE threads SET title = ?, updated_at = ? WHERE user_id = ? AND id = ?
    `)
      .bind(title, nowIso(), userId, threadId)
      .run();
  });

export const pinThread = (
  db: QueryDatabaseClient,
  userId: string,
  threadId: string,
  pinned: boolean,
) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`
      UPDATE threads SET pinned = ?, updated_at = ? WHERE user_id = ? AND id = ?
    `)
      .bind(pinned ? 1 : 0, nowIso(), userId, threadId)
      .run();
  });

export const discardThread = (db: QueryDatabaseClient, userId: string, threadId: string) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`
      UPDATE threads SET status = 'discarded', updated_at = ? WHERE user_id = ? AND id = ?
    `)
      .bind(nowIso(), userId, threadId)
      .run();
  });

export const restoreThread = (db: QueryDatabaseClient, userId: string, threadId: string) =>
  Effect.gen(function* () {
    yield* db
      .prepare("UPDATE threads SET status = 'regular', updated_at = ? WHERE user_id = ? AND id = ?")
      .bind(nowIso(), userId, threadId)
      .run();
  });

export const addThreadMessage = (
  db: QueryDatabaseClient,
  userId: string,
  threadId: string,
  messageId: string,
) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`
      INSERT INTO thread_messages (user_id, thread_id, message_id, included_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, thread_id, message_id) DO NOTHING
    `)
      .bind(userId, threadId, messageId, nowIso())
      .run();
  });

export const getThreadMessages = (db: QueryDatabaseClient, userId: string, threadId: string) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT m.id, m.conversation_id, m.parent_id, m.role, m.parts, m.prompt_tokens, m.completion_tokens, m.total_tokens, m.model, m.created_at
      FROM messages m
      JOIN thread_messages tm ON tm.user_id = m.user_id AND tm.message_id = m.id
      WHERE tm.user_id = ? AND tm.thread_id = ?
      ORDER BY m.created_at ASC
    `)
      .bind(userId, threadId)
      .all<Message>();
    return result.results;
  });

export const getMessage = (db: QueryDatabaseClient, userId: string, messageId: string) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT id, conversation_id, parent_id, role, parts, prompt_tokens, completion_tokens, total_tokens, model, created_at
      FROM messages WHERE user_id = ? AND id = ?
    `)
      .bind(userId, messageId)
      .first<Message>();
    return result ?? null;
  });

export const summarizeThread = (
  db: QueryDatabaseClient,
  userId: string,
  threadId: string,
  summaryText: string,
  targetMessageId?: string,
) =>
  Effect.gen(function* () {
    const thread = yield* getThread(db, userId, threadId);
    if (thread === null) return null;

    const id = crypto.randomUUID();
    const createdAt = nowIso();
    yield* db
      .prepare(`
      INSERT INTO messages (id, user_id, conversation_id, parent_id, role, parts, prompt_tokens, completion_tokens, total_tokens, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        id,
        userId,
        thread.conversation_id,
        targetMessageId ?? thread.anchor_message_id,
        "summary",
        JSON.stringify([{ type: "text", text: summaryText }]),
        null,
        null,
        null,
        null,
        createdAt,
      )
      .run();
    yield* addThreadMessage(db, userId, threadId, id);
    yield* updateConversationTimestamp(db, userId, thread.conversation_id);
    return id;
  });

export const getSuggestionsById = (db: QueryDatabaseClient, userId: string, id: string) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT id, suggestions, created_at
      FROM suggestions
      WHERE user_id = ? AND id = ?
    `)
      .bind(userId, id)
      .first<SuggestionsRow>();
    return result ?? null;
  });

export const saveSuggestions = (
  db: QueryDatabaseClient,
  userId: string,
  id: string,
  suggestions: string[],
) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`
      INSERT INTO suggestions (user_id, id, suggestions, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, id) DO NOTHING
    `)
      .bind(userId, id, JSON.stringify(suggestions), nowIso())
      .run();
  });

export const insertMemory = (
  db: QueryDatabaseClient,
  userId: string,
  content: string,
  source?: string,
  threadId?: string,
) =>
  Effect.gen(function* () {
    const trimmed = content.trim();
    if (trimmed === "") return null;

    const id = crypto.randomUUID();
    yield* db
      .prepare(`
      INSERT INTO memories (id, user_id, content, source, thread_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
      .bind(id, userId, trimmed, source ?? null, threadId ?? null, nowIso())
      .run();

    return id;
  });

export interface MemorySearchResult {
  id: string;
  content: string;
  source: string | null;
  thread_id: string | null;
  created_at: string;
  rank: number;
}

export const searchMemories = (
  db: QueryDatabaseClient,
  userId: string,
  query: string,
  limit = 10,
) =>
  Effect.gen(function* () {
    const term = query.trim();
    if (term === "") {
      const result = yield* db
        .prepare(`
        SELECT id, content, source, thread_id, created_at
        FROM memories
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
        .bind(userId, limit)
        .all<Omit<MemorySearchResult, "rank">>();
      return result.results.map((row) => ({ ...row, rank: 0 }));
    }

    const pattern = `%${term.toLowerCase()}%`;
    const result = yield* db
      .prepare(`
      SELECT id, content, source, thread_id, created_at,
        CASE
          WHEN LOWER(content) = ? THEN 3
          WHEN LOWER(content) LIKE ? THEN 2
          WHEN LOWER(content) LIKE ? THEN 1
          ELSE 0
        END as rank
      FROM memories
      WHERE user_id = ? AND LOWER(content) LIKE ?
      ORDER BY rank DESC, created_at DESC
      LIMIT ?
    `)
      .bind(term.toLowerCase(), `${term.toLowerCase()} %`, pattern, userId, pattern, limit)
      .all<MemorySearchResult>();

    return result.results;
  });

export const getMemories = (db: QueryDatabaseClient, userId: string, limit = 100) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT id, content, source, thread_id, created_at
      FROM memories
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `)
      .bind(userId, limit)
      .all<MemoryRow>();
    return result.results;
  });

export const deleteMemory = (db: QueryDatabaseClient, userId: string, id: string) =>
  Effect.gen(function* () {
    yield* db.prepare(`DELETE FROM memories WHERE user_id = ? AND id = ?`).bind(userId, id).run();
  });

export const insertNote = (db: QueryDatabaseClient, userId: string, content: string) =>
  Effect.gen(function* () {
    const trimmed = content.trim();
    if (trimmed === "") return null;

    const id = crypto.randomUUID();
    const createdAt = nowIso();
    yield* db
      .prepare(`
      INSERT INTO notes (id, user_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `)
      .bind(id, userId, trimmed, createdAt, createdAt)
      .run();

    return id;
  });

export const updateNote = (db: QueryDatabaseClient, userId: string, id: string, content: string) =>
  Effect.gen(function* () {
    const trimmed = content.trim();
    if (trimmed === "") return;

    yield* db
      .prepare(`
      UPDATE notes SET content = ?, updated_at = ? WHERE user_id = ? AND id = ?
    `)
      .bind(trimmed, nowIso(), userId, id)
      .run();
  });

export const deleteNote = (db: QueryDatabaseClient, userId: string, id: string) =>
  Effect.gen(function* () {
    yield* db.prepare(`DELETE FROM notes WHERE user_id = ? AND id = ?`).bind(userId, id).run();
  });

export const getNotes = (db: QueryDatabaseClient, userId: string, limit = 100) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT id, content, created_at, updated_at
      FROM notes
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `)
      .bind(userId, limit)
      .all<NoteRow>();
    return result.results;
  });

export const searchNotes = (db: QueryDatabaseClient, userId: string, query: string, limit = 10) =>
  Effect.gen(function* () {
    const term = query.trim();
    if (term === "") return yield* getNotes(db, userId, limit);

    const pattern = `%${term.toLowerCase()}%`;
    const result = yield* db
      .prepare(`
      SELECT id, content, created_at, updated_at
      FROM notes
      WHERE user_id = ? AND LOWER(content) LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `)
      .bind(userId, pattern, limit)
      .all<NoteRow>();
    return result.results;
  });
