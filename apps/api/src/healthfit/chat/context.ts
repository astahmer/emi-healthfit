import * as Effect from "effect/Effect";
import type { QueryDatabaseClient } from "../../platform/db/client.ts";
import { estimateRecovery } from "./recovery-estimate.ts";
import type { HevySetRow, SleepSessionRow } from "../../db/schema.ts";

interface WorkoutContext {
  lastSessionDate: string | null;
  lastSessionSummary: string;
  recentVolume: number;
  recentWorkoutCount: number;
  recentSets: Array<HevySetRow & { session_start: string }>;
}

interface SleepContext {
  averageMinutes: number | null;
  lastNight: SleepSessionRow | null;
  sevenDayAverage: number | null;
}

export interface ChatContext {
  today: string;
  recoveryLabel: string;
  recoveryExplanation: string;
  lastWorkout: WorkoutContext;
  sleep: SleepContext;
  recentWorkoutCount: number;
}

const now = (): Date => new Date();

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const daysAgo = (days: number): string => {
  const d = now();
  d.setDate(d.getDate() - days);
  return formatDate(d);
};

const minutesToHours = (minutes: number | null): string => {
  if (minutes === null) return "unknown";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
};

export const buildChatContext = (db: QueryDatabaseClient, userId: string) =>
  Effect.gen(function* () {
    const today = formatDate(now());
    const sevenDaysAgo = daysAgo(7);
    const twoDaysAgo = daysAgo(2);

    const kysely = yield* db.kysely;
    const lastSets = yield* Effect.promise(() =>
      kysely
        .selectFrom("hevy_sets as s")
        .innerJoin("hevy_sessions as ses", (join) =>
          join.onRef("s.user_id", "=", "ses.user_id").onRef("s.session_id", "=", "ses.session_id"),
        )
        .selectAll("s")
        .select("ses.start_time as session_start")
        .where("s.user_id", "=", userId)
        .orderBy("ses.start_time", "desc")
        .limit(30)
        .execute(),
    );

    const lastSessions = yield* Effect.promise(() =>
      kysely
        .selectFrom("hevy_sessions")
        .select(["session_id", "title", "start_time", "total_volume_kg"])
        .where("user_id", "=", userId)
        .orderBy("start_time", "desc")
        .limit(3)
        .execute(),
    );

    const recentSets = yield* Effect.promise(() =>
      kysely
        .selectFrom("hevy_sets as s")
        .innerJoin("hevy_sessions as ses", (join) =>
          join.onRef("s.user_id", "=", "ses.user_id").onRef("s.session_id", "=", "ses.session_id"),
        )
        .selectAll("s")
        .where("s.user_id", "=", userId)
        .where("ses.start_time", ">=", sevenDaysAgo)
        .execute(),
    );

    const sleepRows = yield* Effect.promise(() =>
      kysely
        .selectFrom("sleep_sessions")
        .selectAll()
        .where("user_id", "=", userId)
        .where("date", ">=", sevenDaysAgo)
        .orderBy("date", "desc")
        .execute(),
    );

    const recentVolume = recentSets.reduce((sum: number, set: HevySetRow) => {
      if (set.weight_kg !== null && set.reps !== null) {
        return sum + set.weight_kg * set.reps;
      }
      return sum;
    }, 0);

    const recentWorkoutCount = new Set(recentSets.map((set: HevySetRow) => set.session_id)).size;

    const lastSessionDate = lastSessions[0]?.start_time.slice(0, 10) ?? null;

    const lastSessionSummary =
      lastSessions.length > 0
        ? lastSessions
            .map((session) => `${session.title} on ${session.start_time.slice(0, 10)}`)
            .join("; ")
        : "No recent workouts found";

    const sleepMinutes = sleepRows
      .map((s: SleepSessionRow) => s.asleep_min ?? s.in_bed_min)
      .filter((m): m is number => m !== null);

    const sevenDaySleepAvg =
      sleepMinutes.length > 0
        ? sleepMinutes.reduce((a: number, b: number) => a + b, 0) / sleepMinutes.length
        : null;

    const strain48h = lastSets
      .filter((set: HevySetRow & { session_start: string }) => set.session_start >= twoDaysAgo)
      .reduce((sum: number, set: HevySetRow) => {
        if (set.weight_kg !== null && set.reps !== null) {
          return sum + set.weight_kg * set.reps;
        }
        return sum;
      }, 0);

    const { label, explanation } = estimateRecovery({
      sleepAverageMinutes: sevenDaySleepAvg,
      strain48Hours: strain48h,
    });

    return {
      today,
      recoveryLabel: label,
      recoveryExplanation: explanation,
      lastWorkout: {
        lastSessionDate,
        lastSessionSummary,
        recentVolume,
        recentWorkoutCount,
        recentSets: lastSets,
      },
      sleep: {
        averageMinutes: sevenDaySleepAvg,
        lastNight: sleepRows[0] ?? null,
        sevenDayAverage: sevenDaySleepAvg,
      },
      recentWorkoutCount,
    };
  });

export const renderContextPrompt = (ctx: ChatContext, userMessage: string): string => {
  const recentExercises =
    ctx.lastWorkout.recentSets.length > 0
      ? Array.from(new Set(ctx.lastWorkout.recentSets.map((s) => s.exercise_title)))
          .slice(0, 10)
          .join(", ")
      : "none";

  return `You are the user's personal gym assistant with access to their Apple Health and Hevy workout data.

Today: ${ctx.today}
Recovery: ${ctx.recoveryLabel} — ${ctx.recoveryExplanation}
Last workout: ${ctx.lastWorkout.lastSessionSummary}
Last 7 days: ${ctx.sleep.sevenDayAverage !== null ? minutesToHours(ctx.sleep.sevenDayAverage) : "unknown"} sleep avg, ${ctx.recentWorkoutCount} workouts, ${Math.round(ctx.lastWorkout.recentVolume)} kg·reps volume
Recent exercises: ${recentExercises}

${userMessage}`;
};
