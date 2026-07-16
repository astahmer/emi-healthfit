import * as Effect from "effect/Effect";
import type { QueryDatabaseClient } from "./client.ts";
import type {
  BodyMetricRow,
  DailyActivityRow,
  HealthWorkoutRow,
  HevySessionRow,
  HevySetRow,
  SleepSessionRow,
} from "./schema.ts";

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
