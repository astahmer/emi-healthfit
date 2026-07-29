import * as Effect from "effect/Effect";
import { sql } from "kysely";
import type { QueryDatabaseClient } from "@emi/core/server";
import type { HealthfitDatabaseSchema } from "./schema.ts";

type FitnessDb = QueryDatabaseClient<HealthfitDatabaseSchema>;

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

export const getWorkoutHistory = (db: FitnessDb, userId: string, limit = 10) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    return yield* Effect.promise(() =>
      kysely
        .selectFrom("hevy_sessions as s")
        .leftJoin("hevy_sets as st", (join) =>
          join.onRef("st.user_id", "=", "s.user_id").onRef("st.session_id", "=", "s.session_id"),
        )
        .select((eb) => [
          "s.session_id",
          "s.title",
          "s.start_time",
          "s.total_volume_kg",
          eb.fn.count<number>("st.exercise_title").distinct().as("exercise_count"),
          eb.fn.count<number>("st.set_index").as("set_count"),
        ])
        .where("s.user_id", "=", userId)
        .groupBy(["s.session_id", "s.title", "s.start_time", "s.total_volume_kg"])
        .orderBy("s.start_time", "desc")
        .limit(limit)
        .execute(),
    );
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
  db: FitnessDb;
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
  db: FitnessDb,
  userId: string,
  exerciseTitle: string,
  weeks = 8,
) =>
  Effect.gen(function* () {
    const since = isoDateDaysAgo(weeks * 7);
    const kysely = yield* db.kysely;
    const [workouts, prSet] = yield* Effect.all([
      Effect.promise(() =>
        kysely
          .selectFrom("hevy_sets as st")
          .innerJoin("hevy_sessions as s", (join) =>
            join.onRef("s.user_id", "=", "st.user_id").onRef("s.session_id", "=", "st.session_id"),
          )
          .select((eb) => [
            "s.session_id",
            "s.title",
            "s.start_time",
            eb.fn.max("st.weight_kg").as("max_weight_kg"),
            eb.fn.max(sql<number>`st.weight_kg * st.reps`).as("max_volume_kg"),
            eb.fn.sum<number>(sql`st.weight_kg * st.reps`).as("total_volume_kg"),
            eb.fn.sum<number>("st.reps").as("total_reps"),
            eb.fn.countAll<number>().as("sets"),
          ])
          .where("st.user_id", "=", userId)
          .where("st.exercise_title", "=", exerciseTitle)
          .where("s.start_time", ">=", since)
          .groupBy(["s.session_id", "s.title", "s.start_time"])
          .orderBy("s.start_time", "asc")
          .execute(),
      ),
      Effect.promise(() =>
        kysely
          .selectFrom("hevy_sets")
          .select(["weight_kg", "reps"])
          .where("user_id", "=", userId)
          .where("exercise_title", "=", exerciseTitle)
          .where("weight_kg", "is not", null)
          .where("reps", "is not", null)
          .orderBy(sql`weight_kg * reps`, "desc")
          .limit(1)
          .executeTakeFirst(),
      ),
    ]);

    return {
      exercise_title: exerciseTitle,
      weeks,
      workouts,
      personalRecord: {
        weight_kg: prSet?.weight_kg ?? null,
        reps: prSet?.reps ?? null,
        volume_kg:
          prSet === undefined || prSet.weight_kg === null || prSet.reps === null
            ? null
            : prSet.weight_kg * prSet.reps,
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

export const getSleepTrend = (db: FitnessDb, userId: string, days = 7) =>
  Effect.gen(function* () {
    const since = isoDateDaysAgo(days);
    const kysely = yield* db.kysely;
    const row = yield* Effect.promise(() =>
      kysely
        .selectFrom("sleep_sessions")
        .select((eb) => [
          eb.fn.countAll<number>().as("days"),
          eb.fn.avg<number>("in_bed_min").as("avg_in_bed_min"),
          eb.fn.avg<number>("asleep_min").as("avg_asleep_min"),
          eb.fn.avg<number>("awake_min").as("avg_awake_min"),
        ])
        .where("user_id", "=", userId)
        .where("date", ">=", since)
        .executeTakeFirst(),
    );
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

export const getWorkoutStreak = (db: FitnessDb, userId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const rows = yield* Effect.promise(() =>
      kysely
        .selectFrom("hevy_sessions")
        .select(sql<string>`date(start_time)`.as("workout_date"))
        .where("user_id", "=", userId)
        .groupBy(sql`date(start_time)`)
        .orderBy(sql`date(start_time)`, "asc")
        .execute(),
    );
    const streaks = computeStreaks(rows.map((row) => row.workout_date));

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

export const getDataSummary = (db: FitnessDb, userId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const countFor = (
      table:
        | "daily_activity"
        | "health_workouts"
        | "hevy_sessions"
        | "hevy_sets"
        | "sleep_sessions"
        | "body_metrics",
    ) =>
      Effect.promise(() =>
        kysely
          .selectFrom(table)
          .select((eb) => eb.fn.countAll<number>().as("c"))
          .where("user_id", "=", userId)
          .executeTakeFirst(),
      );
    const [daily, workouts, sessions, sets, sleep, body, cursors] = yield* Effect.all([
      countFor("daily_activity"),
      countFor("health_workouts"),
      countFor("hevy_sessions"),
      countFor("hevy_sets"),
      countFor("sleep_sessions"),
      countFor("body_metrics"),
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
  db: FitnessDb;
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

export const getIngestedDataExportSummary = Effect.fn("dataExport.readSummary")(function* ({
  db,
  userId,
}: {
  db: FitnessDb;
  userId: string;
}) {
  const kysely = yield* db.kysely;
  const rangeFor = (
    table: "daily_activity" | "health_workouts" | "sleep_sessions" | "body_metrics",
  ) =>
    Effect.promise(() =>
      kysely
        .selectFrom(table)
        .select((eb) => [
          eb.fn.countAll<number>().as("count"),
          eb.fn.min("date").as("first"),
          eb.fn.max("date").as("last"),
        ])
        .where("user_id", "=", userId)
        .executeTakeFirst(),
    );
  const [activity, workouts, sleep, body, hevySessions, hevySets] = yield* Effect.all([
    rangeFor("daily_activity"),
    rangeFor("health_workouts"),
    rangeFor("sleep_sessions"),
    rangeFor("body_metrics"),
    Effect.promise(() =>
      kysely
        .selectFrom("hevy_sessions")
        .select((eb) => [
          eb.fn.countAll<number>().as("count"),
          eb.fn.min("start_time").as("first"),
          eb.fn.max("start_time").as("last"),
        ])
        .where("user_id", "=", userId)
        .executeTakeFirst(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("hevy_sets")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("user_id", "=", userId)
        .executeTakeFirst(),
    ),
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
  db: FitnessDb;
  userId: string;
  days?: number;
}) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const kysely = yield* db.kysely;
  const [activity, sleep, body, training, exercises] = yield* Effect.all([
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
        .select((eb) => [
          "date",
          eb.fn.sum<number>("asleep_min").as("asleep_min"),
          eb.fn.sum<number>("in_bed_min").as("in_bed_min"),
        ])
        .where("user_id", "=", userId)
        .where("date", ">=", since)
        .groupBy("date")
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
        .select((eb) => [
          sql<string>`substr(start_time, 1, 10)`.as("date"),
          eb.fn.countAll<number>().as("workouts"),
          eb.fn.sum<number>("total_volume_kg").as("volume_kg"),
          eb.fn.sum<number>("duration_sec").as("duration_sec"),
        ])
        .where("user_id", "=", userId)
        .where("start_time", ">=", since)
        .groupBy(sql`substr(start_time, 1, 10)`)
        .orderBy("date")
        .execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("hevy_sets as s")
        .innerJoin("hevy_sessions as h", (join) =>
          join.onRef("h.user_id", "=", "s.user_id").onRef("h.session_id", "=", "s.session_id"),
        )
        .select((eb) => [
          "s.exercise_title",
          eb.fn.countAll<number>().as("sets"),
          sql<number>`sum(coalesce(s.weight_kg, 0) * coalesce(s.reps, 0))`.as("volume_kg"),
        ])
        .where("s.user_id", "=", userId)
        .where("h.start_time", ">=", since)
        .groupBy("s.exercise_title")
        .orderBy("sets", "desc")
        .limit(8)
        .execute(),
    ),
  ]);
  const weights = body.flatMap((row) => (row.weight_kg === null ? [] : [row.weight_kg]));
  const sleepDays = sleep.flatMap((row) =>
    row.date === null
      ? []
      : [
          {
            date: row.date,
            asleep_min: row.asleep_min,
            in_bed_min: row.in_bed_min,
          },
        ],
  );
  return {
    days,
    activity,
    sleep: sleepDays,
    body,
    training,
    exercises,
    highlights: {
      averageSteps: average(activity.flatMap((row) => (row.steps === null ? [] : [row.steps]))),
      averageSleepMinutes: average(
        sleepDays.flatMap((row) => {
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

export const getWorkouts = (db: FitnessDb, userId: string) =>
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
