import * as Effect from "effect/Effect";
import type { ServerDatabase } from "@emi/core/server/database";
import { estimateRecovery } from "./recovery-estimate.ts";
import type { HealthfitDatabaseSchema, HevySetRow, SleepSessionRow } from "../db/schema.ts";
import { getHevySyncState } from "../integrations/hevy/hevy-store.ts";

type ChatContextDb = ServerDatabase.QueryDatabaseClient<HealthfitDatabaseSchema>;

interface WorkoutContext {
  lastSessionDate: string | null;
  lastSessionSummary: string;
  recentVolume: number;
  recentWorkoutCount: number;
  recentSessions: Array<{
    sessionId: string;
    title: string | null;
    startTime: string;
    totalVolumeKg: number | null;
  }>;
  recentSets: Array<HevySetRow & { session_start: string }>;
}

interface SleepContext {
  averageMinutes: number | null;
  lastNight: SleepSessionRow | null;
  sevenDayAverage: number | null;
}

export interface ChatContext {
  today: string;
  hevyLastSyncedAt: string | null;
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

export const buildChatContext = (db: ChatContextDb, userId: string) =>
  Effect.gen(function* () {
    const today = formatDate(now());
    const sevenDaysAgo = daysAgo(7);
    const twoDaysAgo = daysAgo(2);

    const kysely = yield* db.kysely;
    const syncState = yield* getHevySyncState({ db, userId });
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
      hevyLastSyncedAt: syncState?.last_success_at ?? null,
      recoveryLabel: label,
      recoveryExplanation: explanation,
      lastWorkout: {
        lastSessionDate,
        lastSessionSummary,
        recentVolume,
        recentWorkoutCount,
        recentSessions: lastSessions.map((session) => ({
          sessionId: session.session_id,
          title: session.title,
          startTime: session.start_time,
          totalVolumeKg: session.total_volume_kg,
        })),
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

export const renderSystemContext = (ctx: ChatContext): string => {
  const recentExercises =
    ctx.lastWorkout.recentSets.length > 0
      ? Array.from(new Set(ctx.lastWorkout.recentSets.map((s) => s.exercise_title)))
          .slice(0, 10)
          .join(", ")
      : "none";

  const recentWorkouts =
    ctx.lastWorkout.recentSessions.length > 0
      ? ctx.lastWorkout.recentSessions
          .map(
            (session) =>
              `- ${session.sessionId}: ${session.title ?? "Untitled workout"} on ${session.startTime.slice(0, 10)} (${session.totalVolumeKg ?? 0} kg volume)`,
          )
          .join("\n")
      : "- none";

  const recentSets =
    ctx.lastWorkout.recentSets.length > 0
      ? ctx.lastWorkout.recentSets
          .map((set) => {
            const load = set.weight_kg === null ? "bodyweight" : `${set.weight_kg} kg`;
            const reps = set.reps === null ? "duration-only" : `${set.reps} reps`;
            return `- ${set.session_id} / ${set.exercise_title}: ${load} x ${reps}`;
          })
          .join("\n")
      : "- none";

  return `## Current HealthFit data

This data snapshot was read from the user's HealthFit database immediately after the Hevy freshness check. Treat it as the current source of truth. Older conversation messages and older tool results are historical context, not current workout data.

Today: ${ctx.today}
Hevy last successful sync: ${ctx.hevyLastSyncedAt ?? "not connected or never synced"}
Recovery: ${ctx.recoveryLabel} — ${ctx.recoveryExplanation}
Last workout: ${ctx.lastWorkout.lastSessionSummary}
Last 7 days: ${ctx.sleep.sevenDayAverage !== null ? minutesToHours(ctx.sleep.sevenDayAverage) : "unknown"} sleep avg, ${ctx.recentWorkoutCount} workouts, ${Math.round(ctx.lastWorkout.recentVolume)} kg·reps volume
Recent exercises: ${recentExercises}

Recent Hevy workouts:
${recentWorkouts}

Recent Hevy sets:
${recentSets}

When a question needs an exercise or set breakdown not present above, call get_workout_history and then get_workout_details using these current session IDs before answering. Do not answer from an older workout result in the conversation.`;
};

export const renderContextPrompt = (ctx: ChatContext, userMessage: string): string =>
  `${renderSystemContext(ctx)}\n\n${userMessage}`;
