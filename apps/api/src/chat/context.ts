import * as Effect from "effect/Effect";
import type { QueryDatabaseClient } from "../db/client.ts";
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

    const dailyActivity = yield* db
      .prepare(`
      SELECT *
      FROM daily_activity
      WHERE user_id = ? AND date >= ?
      ORDER BY date DESC
    `)
      .bind(userId, sevenDaysAgo)
      .all<{
        date: string;
        active_kcal: number;
        steps: number;
      }>();

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

    const activeKcalAvg =
      dailyActivity.results.length > 0
        ? dailyActivity.results.reduce(
            (sum: number, d: { active_kcal: number }) => sum + (d.active_kcal ?? 0),
            0,
          ) / dailyActivity.results.length
        : null;

    const { label, explanation } = computeRecoveryLabel(sevenDaySleepAvg, strain48h, activeKcalAvg);

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

const computeRecoveryLabel = (
  sleepAvgMin: number | null,
  strain48h: number,
  activeKcalAvg: number | null,
): { label: string; explanation: string } => {
  const sleepScore = sleepAvgMin === null ? 0 : Math.min(sleepAvgMin / 480, 1);
  const strainScore = Math.min(strain48h / 10000, 1);
  const activityScore = activeKcalAvg === null ? 0.5 : Math.min(activeKcalAvg / 500, 1);

  const recovery = sleepScore * 0.5 + activityScore * 0.2 - strainScore * 0.3;

  if (recovery >= 0.6) {
    return {
      label: "Ready",
      explanation: `Sleep avg ${minutesToHours(sleepAvgMin)} last 7 days, strain 48h ${Math.round(strain48h)} kg·reps.`,
    };
  }

  if (recovery >= 0.3) {
    return {
      label: "Caution",
      explanation: `Sleep avg ${minutesToHours(sleepAvgMin)} last 7 days, strain 48h ${Math.round(strain48h)} kg·reps. Consider lighter volume today.`,
    };
  }

  return {
    label: "Rest needed",
    explanation: `Low recovery: sleep avg ${minutesToHours(sleepAvgMin)} last 7 days, high strain 48h ${Math.round(strain48h)} kg·reps. Prioritize rest.`,
  };
};

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
