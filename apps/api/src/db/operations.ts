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

export interface WorkoutHistoryItem {
  session_id: string;
  title: string | null;
  start_time: string;
  total_volume_kg: number | null;
  exercise_count: number;
  set_count: number;
}

export const getWorkoutHistory = (db: QueryDatabaseClient, limit = 10) =>
  Effect.gen(function* () {
    const result = yield* db.prepare(`
      SELECT
        s.session_id,
        s.title,
        s.start_time,
        s.total_volume_kg,
        COUNT(DISTINCT st.exercise_title) as exercise_count,
        COUNT(st.set_index) as set_count
      FROM hevy_sessions s
      LEFT JOIN hevy_sets st ON st.session_id = s.session_id
      GROUP BY s.session_id
      ORDER BY s.start_time DESC
      LIMIT ?
    `).bind(limit).all<WorkoutHistoryItem>();

    return result.results;
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

export interface ExerciseProgress {
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
  exerciseTitle: string,
  weeks = 8,
) =>
  Effect.gen(function* () {
    const since = isoDateDaysAgo(weeks * 7);

    const workouts = yield* db.prepare(`
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
      JOIN hevy_sessions s ON s.session_id = st.session_id
      WHERE st.exercise_title = ? AND s.start_time >= ?
      GROUP BY s.session_id
      ORDER BY s.start_time ASC
    `).bind(exerciseTitle, since).all<ExerciseProgressSet>();

    const prRow = yield* db.prepare(`
      SELECT
        MAX(weight_kg) as pr_weight_kg,
        MAX(weight_kg * reps) as pr_volume_kg
      FROM hevy_sets
      WHERE exercise_title = ? AND weight_kg IS NOT NULL AND reps IS NOT NULL
    `).bind(exerciseTitle).first<{ pr_weight_kg: number | null; pr_volume_kg: number | null }>();

    const prSet = yield* db.prepare(`
      SELECT weight_kg, reps
      FROM hevy_sets
      WHERE exercise_title = ? AND weight_kg IS NOT NULL AND reps IS NOT NULL
      ORDER BY weight_kg * reps DESC
      LIMIT 1
    `).bind(exerciseTitle).first<{ weight_kg: number | null; reps: number | null }>();

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

export interface SleepTrend {
  days: number;
  avg_in_bed_min: number | null;
  avg_asleep_min: number | null;
  avg_awake_min: number | null;
  avg_sleep_hours: number | null;
}

export const getSleepTrend = (db: QueryDatabaseClient, days = 7) =>
  Effect.gen(function* () {
    const since = isoDateDaysAgo(days);
    const row = yield* db.prepare(`
      SELECT
        COUNT(*) as days,
        AVG(in_bed_min) as avg_in_bed_min,
        AVG(asleep_min) as avg_asleep_min,
        AVG(awake_min) as avg_awake_min
      FROM sleep_sessions
      WHERE date >= ?
    `).bind(since).first<{
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

export interface WorkoutStreak {
  current_streak: number;
  longest_streak: number;
  last_workout_date: string | null;
}

const computeStreaks = (dates: string[]): { current: number; longest: number; last: string | null } => {
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

export const getWorkoutStreak = (db: QueryDatabaseClient) =>
  Effect.gen(function* () {
    const result = yield* db.prepare(`
      SELECT DISTINCT date(start_time) as workout_date
      FROM hevy_sessions
      ORDER BY workout_date ASC
    `).all<{ workout_date: string }>();

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

export const getWorkouts = (db: QueryDatabaseClient) =>
  Effect.gen(function* () {
    const sessions = yield* db.prepare(`
      SELECT
        s.session_id,
        s.title,
        s.start_time,
        s.end_time,
        s.duration_sec,
        s.total_volume_kg,
        COUNT(DISTINCT st.set_index) as sets,
        COUNT(DISTINCT st.exercise_title) as exercises
      FROM hevy_sessions s
      LEFT JOIN hevy_sets st ON st.session_id = s.session_id
      GROUP BY s.session_id
      ORDER BY s.start_time DESC
    `).all<WorkoutSession>();

    return sessions.results;
  });

export interface Thread {
  id: string;
  title: string | null;
  status: "regular" | "archived";
  created_at: string;
  updated_at: string;
}

export interface ThreadMessage {
  id: string;
  thread_id: string;
  role: string;
  parts: string;
  created_at: string;
}

const nowIso = (): string => new Date().toISOString();

export const createThread = (db: QueryDatabaseClient, title?: string) =>
  Effect.gen(function* () {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    yield* db.prepare(`
      INSERT INTO threads (id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, title ?? null, "regular", createdAt, createdAt).run();
    return id;
  });

export const getThreads = (db: QueryDatabaseClient, search?: string) =>
  Effect.gen(function* () {
    if (search !== undefined && search.trim() !== "") {
      const term = `%${search.trim()}%`;
      const result = yield* db.prepare(`
        SELECT * FROM threads
        WHERE status = 'regular' AND title LIKE ?
        ORDER BY updated_at DESC
        LIMIT 100
      `).bind(term).all<Thread>();
      return result.results;
    }

    const result = yield* db.prepare(`
      SELECT * FROM threads
      WHERE status = 'regular'
      ORDER BY updated_at DESC
      LIMIT 100
    `).all<Thread>();
    return result.results;
  });

export const getThread = (db: QueryDatabaseClient, threadId: string) =>
  Effect.gen(function* () {
    const result = yield* db.prepare(`
      SELECT * FROM threads WHERE id = ?
    `).bind(threadId).first<Thread>();
    return result ?? null;
  });

export const deleteThread = (db: QueryDatabaseClient, threadId: string) =>
  Effect.gen(function* () {
    yield* db.prepare(`DELETE FROM threads WHERE id = ?`).bind(threadId).run();
  });

export const renameThread = (db: QueryDatabaseClient, threadId: string, title: string) =>
  Effect.gen(function* () {
    yield* db.prepare(`
      UPDATE threads SET title = ?, updated_at = ? WHERE id = ?
    `).bind(title, nowIso(), threadId).run();
  });

export const updateThreadTimestamp = (db: QueryDatabaseClient, threadId: string) =>
  Effect.gen(function* () {
    yield* db.prepare(`
      UPDATE threads SET updated_at = ? WHERE id = ?
    `).bind(nowIso(), threadId).run();
  });

export const getThreadMessages = (db: QueryDatabaseClient, threadId: string) =>
  Effect.gen(function* () {
    const result = yield* db.prepare(`
      SELECT * FROM messages
      WHERE thread_id = ?
      ORDER BY created_at ASC
    `).bind(threadId).all<ThreadMessage>();
    return result.results;
  });

export const saveThreadMessages = (
  db: QueryDatabaseClient,
  threadId: string,
  messages: Array<{ role: string; parts: unknown[] }>,
) =>
  Effect.gen(function* () {
    if (messages.length === 0) return;

    const createdAt = nowIso();
    const statements = messages.map((message) =>
      db.prepare(`
        INSERT INTO messages (id, thread_id, role, parts, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        threadId,
        message.role,
        JSON.stringify(message.parts),
        createdAt,
      )
    );

    yield* runBatches(db, statements);
    yield* updateThreadTimestamp(db, threadId);
  });
