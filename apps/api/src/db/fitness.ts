import * as Effect from "effect/Effect";
import type { QueryDatabaseClient } from "./client.ts";

export interface WorkoutHistoryItem {
  session_id: string;
  title: string | null;
  start_time: string;
  total_volume_kg: number | null;
  exercise_count: number;
  set_count: number;
}

const average = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;

export const getWorkoutHistory = (db: QueryDatabaseClient, userId: string, limit = 10) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const [sessions, sets] = yield* Effect.all([
      Effect.promise(() =>
        kysely
          .selectFrom("hevy_sessions")
          .select(["session_id", "title", "start_time", "total_volume_kg"])
          .where("user_id", "=", userId)
          .orderBy("start_time", "desc")
          .limit(limit)
          .execute(),
      ),
      Effect.promise(() =>
        kysely
          .selectFrom("hevy_sets")
          .select(["session_id", "exercise_title"])
          .where("user_id", "=", userId)
          .execute(),
      ),
    ]);
    const setsBySession = new Map<string, Array<{ exercise_title: string }>>();
    for (const set of sets) {
      const sessionSets = setsBySession.get(set.session_id) ?? [];
      sessionSets.push(set);
      setsBySession.set(set.session_id, sessionSets);
    }
    return sessions.map((session) => {
      const sessionSets = setsBySession.get(session.session_id) ?? [];
      return {
        session_id: session.session_id,
        title: session.title,
        start_time: session.start_time,
        total_volume_kg: session.total_volume_kg,
        exercise_count: new Set(sessionSets.map((set) => set.exercise_title)).size,
        set_count: sessionSets.length,
      } satisfies WorkoutHistoryItem;
    });
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
  const kysely = yield* db.kysely;
  const rows = yield* Effect.promise(() =>
    kysely
      .selectFrom("hevy_sessions as s")
      .innerJoin("hevy_sets as st", (join) =>
        join.onRef("st.user_id", "=", "s.user_id").onRef("st.session_id", "=", "s.session_id"),
      )
      .select([
        "s.session_id",
        "s.title as session_title",
        "s.start_time",
        "s.end_time",
        "s.duration_sec",
        "s.total_volume_kg as session_volume_kg",
        "st.exercise_title",
        "st.set_index",
        "st.set_type",
        "st.weight_kg",
        "st.reps",
        "st.rpe",
      ])
      .where("s.user_id", "=", userId)
      .where("s.session_id", "=", sessionId)
      .orderBy("st.exercise_title")
      .orderBy("st.set_index")
      .execute(),
  );
  const first = rows[0];
  if (first === undefined) return null;

  const exerciseMap = new Map<
    string,
    { title: string; volumeKg: number; sets: Array<Omit<WorkoutDetailSetRow, "exercise_title">> }
  >();
  for (const row of rows) {
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
    const kysely = yield* db.kysely;
    const [workoutRows, personalRecordRows] = yield* Effect.all([
      Effect.promise(() =>
        kysely
          .selectFrom("hevy_sets as st")
          .innerJoin("hevy_sessions as s", (join) =>
            join.onRef("s.user_id", "=", "st.user_id").onRef("s.session_id", "=", "st.session_id"),
          )
          .select(["s.session_id", "s.title", "s.start_time", "st.weight_kg", "st.reps"])
          .where("st.user_id", "=", userId)
          .where("st.exercise_title", "=", exerciseTitle)
          .where("s.start_time", ">=", since)
          .orderBy("s.start_time", "asc")
          .execute(),
      ),
      Effect.promise(() =>
        kysely
          .selectFrom("hevy_sets")
          .select(["weight_kg", "reps"])
          .where("user_id", "=", userId)
          .where("exercise_title", "=", exerciseTitle)
          .execute(),
      ),
    ]);
    const workoutSets = new Map<string, typeof workoutRows>();
    for (const row of workoutRows) {
      const sets = workoutSets.get(row.session_id) ?? [];
      sets.push(row);
      workoutSets.set(row.session_id, sets);
    }
    const workouts = [...workoutSets.values()].map((sets) => {
      const first = sets[0];
      const weights = sets.flatMap((set) => (set.weight_kg === null ? [] : [set.weight_kg]));
      const volumes = sets.flatMap((set) =>
        set.weight_kg === null || set.reps === null ? [] : [set.weight_kg * set.reps],
      );
      const reps = sets.flatMap((set) => (set.reps === null ? [] : [set.reps]));
      return {
        session_id: first.session_id,
        title: first.title,
        start_time: first.start_time,
        max_weight_kg: weights.length === 0 ? null : Math.max(...weights),
        max_volume_kg: volumes.length === 0 ? null : Math.max(...volumes),
        total_volume_kg:
          volumes.length === 0 ? null : volumes.reduce((total, value) => total + value, 0),
        total_reps: reps.length === 0 ? null : reps.reduce((total, value) => total + value, 0),
        sets: sets.length,
      } satisfies ExerciseProgressSet;
    });
    const prSet = personalRecordRows.reduce<{
      weight_kg: number;
      reps: number;
      volume_kg: number;
    } | null>((current, row) => {
      if (row.weight_kg === null || row.reps === null) return current;
      const volume_kg = row.weight_kg * row.reps;
      if (current === null || volume_kg > current.volume_kg) {
        return { weight_kg: row.weight_kg, reps: row.reps, volume_kg };
      }
      return current;
    }, null);

    return {
      exercise_title: exerciseTitle,
      weeks,
      workouts,
      personalRecord: {
        weight_kg: prSet?.weight_kg ?? null,
        reps: prSet?.reps ?? null,
        volume_kg: prSet?.volume_kg ?? null,
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
    const kysely = yield* db.kysely;
    const rows = yield* Effect.promise(() =>
      kysely
        .selectFrom("sleep_sessions")
        .select(["in_bed_min", "asleep_min", "awake_min"])
        .where("user_id", "=", userId)
        .where("date", ">=", since)
        .execute(),
    );
    const asleepMin = average(
      rows.flatMap((row) => (row.asleep_min === null ? [] : [row.asleep_min])),
    );

    return {
      days: rows.length,
      avg_in_bed_min: average(
        rows.flatMap((row) => (row.in_bed_min === null ? [] : [row.in_bed_min])),
      ),
      avg_asleep_min: asleepMin,
      avg_awake_min: average(
        rows.flatMap((row) => (row.awake_min === null ? [] : [row.awake_min])),
      ),
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

  const sorted = Array.from(new Set(dates)).toSorted();
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
    const kysely = yield* db.kysely;
    const rows = yield* Effect.promise(() =>
      kysely
        .selectFrom("hevy_sessions")
        .select("start_time")
        .where("user_id", "=", userId)
        .orderBy("start_time", "asc")
        .execute(),
    );
    const streaks = computeStreaks(rows.map((row) => row.start_time.slice(0, 10)));

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
    const kysely = yield* db.kysely;
    const [daily, workouts, sessions, sets, sleep, body, cursors] = yield* Effect.all([
      Effect.promise(() =>
        kysely.selectFrom("daily_activity").select("date").where("user_id", "=", userId).execute(),
      ),
      Effect.promise(() =>
        kysely.selectFrom("health_workouts").select("id").where("user_id", "=", userId).execute(),
      ),
      Effect.promise(() =>
        kysely
          .selectFrom("hevy_sessions")
          .select("session_id")
          .where("user_id", "=", userId)
          .execute(),
      ),
      Effect.promise(() =>
        kysely.selectFrom("hevy_sets").select("id").where("user_id", "=", userId).execute(),
      ),
      Effect.promise(() =>
        kysely.selectFrom("sleep_sessions").select("date").where("user_id", "=", userId).execute(),
      ),
      Effect.promise(() =>
        kysely.selectFrom("body_metrics").select("date").where("user_id", "=", userId).execute(),
      ),
      Effect.promise(() =>
        kysely
          .selectFrom("sync_cursors")
          .select(["source", "last_sync"])
          .where("user_id", "=", userId)
          .execute(),
      ),
    ]);

    const cursorMap = new Map(cursors.map((row) => [row.source, row.last_sync]));

    return {
      dailyActivity: daily.length,
      healthWorkouts: workouts.length,
      hevySessions: sessions.length,
      hevySets: sets.length,
      sleepSessions: sleep.length,
      bodyMetrics: body.length,
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
  const kysely = yield* db.kysely;
  const [
    dailyActivity,
    healthWorkouts,
    hevySessions,
    hevySets,
    sleepSessions,
    bodyMetrics,
    cursors,
  ] = yield* Effect.all([
    Effect.promise(() =>
      kysely
        .selectFrom("daily_activity")
        .selectAll()
        .where("user_id", "=", userId)
        .orderBy("date")
        .execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("health_workouts")
        .selectAll()
        .where("user_id", "=", userId)
        .orderBy("date")
        .orderBy("id")
        .execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("hevy_sessions")
        .selectAll()
        .where("user_id", "=", userId)
        .orderBy("start_time")
        .orderBy("session_id")
        .execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("hevy_sets")
        .selectAll()
        .where("user_id", "=", userId)
        .orderBy("session_id")
        .orderBy("exercise_title")
        .orderBy("set_index")
        .execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("sleep_sessions")
        .selectAll()
        .where("user_id", "=", userId)
        .orderBy("date")
        .orderBy("start")
        .execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("body_metrics")
        .selectAll()
        .where("user_id", "=", userId)
        .orderBy("date")
        .execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("sync_cursors")
        .select(["source", "last_sync"])
        .where("user_id", "=", userId)
        .orderBy("source")
        .execute(),
    ),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    health: {
      dailyActivity,
      workouts: healthWorkouts,
      sleepSessions,
      bodyMetrics,
    },
    hevy: {
      sessions: hevySessions,
      sets: hevySets,
    },
    syncCursors: cursors,
  };
});

interface ExportRange {
  count: number;
  first: string | null;
  last: string | null;
}

const toExportRange = (values: Array<string | null>): ExportRange => {
  const present = values.filter((value): value is string => value !== null).toSorted();
  return { count: values.length, first: present[0] ?? null, last: present.at(-1) ?? null };
};

export const getIngestedDataExportSummary = Effect.fn("dataExport.readSummary")(function* ({
  db,
  userId,
}: {
  db: QueryDatabaseClient;
  userId: string;
}) {
  const kysely = yield* db.kysely;
  const [activity, workouts, sleep, body, hevySessions, hevySets] = yield* Effect.all([
    Effect.promise(() =>
      kysely.selectFrom("daily_activity").select("date").where("user_id", "=", userId).execute(),
    ),
    Effect.promise(() =>
      kysely.selectFrom("health_workouts").select("date").where("user_id", "=", userId).execute(),
    ),
    Effect.promise(() =>
      kysely.selectFrom("sleep_sessions").select("date").where("user_id", "=", userId).execute(),
    ),
    Effect.promise(() =>
      kysely.selectFrom("body_metrics").select("date").where("user_id", "=", userId).execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("hevy_sessions")
        .select("start_time")
        .where("user_id", "=", userId)
        .execute(),
    ),
    Effect.promise(() =>
      kysely.selectFrom("hevy_sets").select("id").where("user_id", "=", userId).execute(),
    ),
  ]);
  const sources = {
    dailyActivity: toExportRange(activity.map((row) => row.date)),
    healthWorkouts: toExportRange(workouts.map((row) => row.date)),
    sleepSessions: toExportRange(sleep.map((row) => row.date)),
    bodyMetrics: toExportRange(body.map((row) => row.date)),
    hevySessions: toExportRange(hevySessions.map((row) => row.start_time)),
    hevySets: { count: hevySets.length, first: null, last: null },
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
  const kysely = yield* db.kysely;
  const [activity, sleepRows, body, trainingRows, exerciseRows] = yield* Effect.all([
    Effect.promise(() =>
      kysely
        .selectFrom("daily_activity")
        .select(["date", "steps", "active_kcal", "exercise_min"])
        .where("user_id", "=", userId)
        .where("date", ">=", since)
        .orderBy("date")
        .execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("sleep_sessions")
        .select(["date", "asleep_min", "in_bed_min"])
        .where("user_id", "=", userId)
        .where("date", ">=", since)
        .orderBy("date")
        .execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("body_metrics")
        .select(["date", "weight_kg", "body_fat_pct", "lean_mass_kg"])
        .where("user_id", "=", userId)
        .where("date", ">=", since)
        .orderBy("date")
        .execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("hevy_sessions")
        .select(["start_time", "total_volume_kg", "duration_sec"])
        .where("user_id", "=", userId)
        .where("start_time", ">=", since)
        .orderBy("start_time")
        .execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("hevy_sets as s")
        .innerJoin("hevy_sessions as h", (join) =>
          join.onRef("h.user_id", "=", "s.user_id").onRef("h.session_id", "=", "s.session_id"),
        )
        .select(["s.exercise_title", "s.weight_kg", "s.reps"])
        .where("s.user_id", "=", userId)
        .where("h.start_time", ">=", since)
        .execute(),
    ),
  ]);
  const sleepByDate = new Map<string, { asleep: number[]; inBed: number[] }>();
  for (const row of sleepRows) {
    if (row.date === null) continue;
    const values = sleepByDate.get(row.date) ?? { asleep: [], inBed: [] };
    if (row.asleep_min !== null) values.asleep.push(row.asleep_min);
    if (row.in_bed_min !== null) values.inBed.push(row.in_bed_min);
    sleepByDate.set(row.date, values);
  }
  const sleep = [...sleepByDate.entries()]
    .map(([date, values]) => ({
      date,
      asleep_min:
        values.asleep.length === 0 ? null : values.asleep.reduce((sum, value) => sum + value, 0),
      in_bed_min:
        values.inBed.length === 0 ? null : values.inBed.reduce((sum, value) => sum + value, 0),
    }))
    .toSorted((left, right) => left.date.localeCompare(right.date));
  const trainingByDate = new Map<
    string,
    { workouts: number; volume: number[]; duration: number[] }
  >();
  for (const row of trainingRows) {
    const date = row.start_time.slice(0, 10);
    const values = trainingByDate.get(date) ?? { workouts: 0, volume: [], duration: [] };
    values.workouts += 1;
    if (row.total_volume_kg !== null) values.volume.push(row.total_volume_kg);
    if (row.duration_sec !== null) values.duration.push(row.duration_sec);
    trainingByDate.set(date, values);
  }
  const training = [...trainingByDate.entries()]
    .map(([date, values]) => ({
      date,
      workouts: values.workouts,
      volume_kg:
        values.volume.length === 0 ? null : values.volume.reduce((sum, value) => sum + value, 0),
      duration_sec:
        values.duration.length === 0
          ? null
          : values.duration.reduce((sum, value) => sum + value, 0),
    }))
    .toSorted((left, right) => left.date.localeCompare(right.date));
  const exercisesByTitle = new Map<string, { sets: number; volume_kg: number }>();
  for (const row of exerciseRows) {
    const exercise = exercisesByTitle.get(row.exercise_title) ?? { sets: 0, volume_kg: 0 };
    exercise.sets += 1;
    exercise.volume_kg += (row.weight_kg ?? 0) * (row.reps ?? 0);
    exercisesByTitle.set(row.exercise_title, exercise);
  }
  const exercises = [...exercisesByTitle.entries()]
    .map(([exercise_title, values]) => ({ exercise_title, ...values }))
    .toSorted((left, right) => right.sets - left.sets)
    .slice(0, 8);
  const weights = body.flatMap((row) => (row.weight_kg === null ? [] : [row.weight_kg]));
  return {
    days,
    activity,
    sleep,
    body,
    training,
    exercises,
    highlights: {
      averageSteps: average(activity.flatMap((row) => (row.steps === null ? [] : [row.steps]))),
      averageSleepMinutes: average(
        sleep.flatMap((row) => {
          const minutes = row.asleep_min ?? row.in_bed_min;
          return minutes === null ? [] : [minutes];
        }),
      ),
      workouts: training.reduce((total, row) => total + row.workouts, 0),
      trainingVolumeKg: training.reduce((total, row) => total + (row.volume_kg ?? 0), 0),
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
    const kysely = yield* db.kysely;
    const [sessions, sets] = yield* Effect.all([
      Effect.promise(() =>
        kysely
          .selectFrom("hevy_sessions")
          .select([
            "session_id",
            "title",
            "start_time",
            "end_time",
            "duration_sec",
            "total_volume_kg",
          ])
          .where("user_id", "=", userId)
          .orderBy("start_time", "desc")
          .execute(),
      ),
      Effect.promise(() =>
        kysely
          .selectFrom("hevy_sets")
          .select([
            "session_id",
            "exercise_title",
            "set_index",
            "set_type",
            "weight_kg",
            "reps",
            "rpe",
            "distance_km",
            "duration_seconds",
            "exercise_notes",
          ])
          .where("user_id", "=", userId)
          .orderBy("session_id")
          .orderBy("exercise_title")
          .orderBy("set_index")
          .execute(),
      ),
    ]);

    const setsBySession = new Map<string, typeof sets>();
    for (const set of sets) {
      const list = setsBySession.get(set.session_id);
      if (list === undefined) {
        setsBySession.set(set.session_id, [set]);
      } else {
        list.push(set);
      }
    }

    return sessions.map((session) => {
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

      return {
        session_id: session.session_id,
        title: session.title,
        start_time: session.start_time,
        end_time: session.end_time,
        duration_sec: session.duration_sec,
        total_volume_kg: session.total_volume_kg,
        sets: sessionSets.length,
        exercises: exercisesByTitle.size,
        exerciseDetails: exercises,
      } satisfies WorkoutSessionDetail;
    });
  });
