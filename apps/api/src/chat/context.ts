import * as Effect from "effect/Effect";
import type { QueryDatabaseClient } from "../db/client.ts";
import { estimateRecovery } from "./recovery-estimate.ts";
import type { HevySetRow, SleepSessionRow } from "../db/schema.ts";

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

    const lastSets = yield* db
      .prepare(`
      SELECT s.*, ses.start_time as session_start
      FROM hevy_sets s
      JOIN hevy_sessions ses ON s.user_id = ses.user_id AND s.session_id = ses.session_id
      WHERE s.user_id = ?
      ORDER BY ses.start_time DESC
      LIMIT 30
    `)
      .bind(userId)
      .all<HevySetRow & { session_start: string }>();

    const lastSessions = yield* db
      .prepare(`
      SELECT *
      FROM hevy_sessions
      WHERE user_id = ?
      ORDER BY start_time DESC
      LIMIT 3
    `)
      .bind(userId)
      .all<{
        session_id: string;
        title: string;
        start_time: string;
        total_volume_kg: number;
      }>();

    const recentSets = yield* db
      .prepare(`
      SELECT s.*
      FROM hevy_sets s
      JOIN hevy_sessions ses ON s.user_id = ses.user_id AND s.session_id = ses.session_id
      WHERE s.user_id = ? AND ses.start_time >= ?
    `)
      .bind(userId, sevenDaysAgo)
      .all<HevySetRow>();

    const sleepRows = yield* db
      .prepare(`
      SELECT *
      FROM sleep_sessions
      WHERE user_id = ? AND date >= ?
      ORDER BY date DESC
    `)
      .bind(userId, sevenDaysAgo)
      .all<SleepSessionRow>();

    const recentVolume = recentSets.results.reduce((sum: number, set: HevySetRow) => {
      if (set.weight_kg !== null && set.reps !== null) {
        return sum + set.weight_kg * set.reps;
      }
      return sum;
    }, 0);

    const recentWorkoutCount = new Set(recentSets.results.map((set: HevySetRow) => set.session_id))
      .size;

    const lastSessionDate = lastSessions.results[0]?.start_time.slice(0, 10) ?? null;

    const lastSessionSummary =
      lastSessions.results.length > 0
        ? lastSessions.results
            .map((session) => `${session.title} on ${session.start_time.slice(0, 10)}`)
            .join("; ")
        : "No recent workouts found";

    const sleepMinutes = sleepRows.results
      .map((s: SleepSessionRow) => s.asleep_min ?? s.in_bed_min)
      .filter((m): m is number => m !== null);

    const sevenDaySleepAvg =
      sleepMinutes.length > 0
        ? sleepMinutes.reduce((a: number, b: number) => a + b, 0) / sleepMinutes.length
        : null;

    const strain48h = lastSets.results
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
        recentSets: lastSets.results,
      },
      sleep: {
        averageMinutes: sevenDaySleepAvg,
        lastNight: sleepRows.results[0] ?? null,
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
