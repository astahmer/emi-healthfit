import * as Effect from "effect/Effect";
import type { ServerDatabase } from "@emi/core/server/database";
import { estimateRecovery } from "./recovery-estimate.ts";
import type { HealthfitDatabaseSchema, HevySetRow, SleepSessionRow } from "../db/schema.ts";
import { classifySessionFocus, type SessionFocus } from "../db/fitness.ts";
import { getHevySyncState } from "../integrations/hevy/hevy-store.ts";

type ChatContextDb = ServerDatabase.QueryDatabaseClient<HealthfitDatabaseSchema>;

export interface WeeklyPlan {
  /** Most common focus logged on each weekday (0=Sunday .. 6=Saturday) over the lookback window. */
  byWeekday: Array<{ weekday: number; focus: SessionFocus; occurrences: number; titles: string[] }>;
  /** Focus most commonly logged on today's weekday, when one is established. */
  todayFocus: SessionFocus;
  /** Focus most commonly logged on the next weekday with an established session. */
  nextFocus: SessionFocus;
  /** Whether a stable pattern was found (at least 2 occurrences for the relevant day). */
  stable: boolean;
}

interface WorkoutContext {
  lastSessionDate: string | null;
  lastSessionFocus: SessionFocus;
  lastSessionSummary: string;
  recentVolume: number;
  recentWorkoutCount: number;
  recentSessions: Array<{
    sessionId: string;
    title: string | null;
    startTime: string;
    totalVolumeKg: number | null;
    focus: "upper" | "lower" | "full_body" | "unknown";
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
  weekday: string;
  weeklyPlan: WeeklyPlan;
  hevyLastSyncedAt: string | null;
  latestWeightKg: number | null;
  latestWeightDate: string | null;
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

const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const weekdayName = (date: Date): string => weekdayNames[date.getDay()];

const focusLabel = (focus: SessionFocus): string => {
  switch (focus) {
    case "upper":
      return "upper";
    case "lower":
      return "lower";
    case "full_body":
      return "full body";
    case "unknown":
      return "unknown";
  }
};

const deriveWeeklyPlan = ({
  sessions,
  today,
}: {
  sessions: Array<{ title: string | null; startTime: string }>;
  today: Date;
}): WeeklyPlan => {
  const byWeekday = new Map<number, Map<SessionFocus, { occurrences: number; titles: string[] }>>();
  for (const session of sessions) {
    const weekday = new Date(`${session.startTime.slice(0, 10)}T00:00:00Z`).getUTCDay();
    const focus = classifySessionFocus(session.title);
    const weekdayFocuses = byWeekday.get(weekday) ?? new Map();
    const entry = weekdayFocuses.get(focus) ?? { occurrences: 0, titles: [] };
    entry.occurrences += 1;
    if (session.title !== null && !entry.titles.includes(session.title)) {
      entry.titles.push(session.title);
    }
    weekdayFocuses.set(focus, entry);
    byWeekday.set(weekday, weekdayFocuses);
  }

  const ordered: WeeklyPlan["byWeekday"] = [];
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const focuses = byWeekday.get(weekday);
    if (focuses === undefined || focuses.size === 0) continue;
    const [focus, entry] = [...focuses.entries()].toSorted(
      (left, right) => right[1].occurrences - left[1].occurrences,
    )[0];
    if (focus === undefined || entry === undefined) continue;
    ordered.push({ weekday, focus, occurrences: entry.occurrences, titles: entry.titles });
  }
  ordered.sort((left, right) => left.weekday - right.weekday);

  const todayWeekday = today.getDay();
  const todayEntry = ordered.find((entry) => entry.weekday === todayWeekday);
  const todayFocus: SessionFocus = todayEntry?.focus ?? "unknown";

  const nextDays = [1, 2, 3, 4, 5, 6, 7].map((offset) => (todayWeekday + offset) % 7);
  const nextEntry = nextDays
    .map((weekday) => ordered.find((entry) => entry.weekday === weekday))
    .find((entry) => entry !== undefined);
  const nextFocus: SessionFocus = nextEntry?.focus ?? "unknown";

  const stable = todayEntry !== undefined ? todayEntry.occurrences >= 2 : nextEntry !== undefined;

  return { byWeekday: ordered, todayFocus, nextFocus, stable };
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
        .limit(5)
        .execute(),
    );

    const scheduleSessions = yield* Effect.promise(() =>
      kysely
        .selectFrom("hevy_sessions")
        .select(["title", "start_time"])
        .where("user_id", "=", userId)
        .where("start_time", ">=", daysAgo(42))
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

    const latestWeight = yield* Effect.promise(() =>
      kysely
        .selectFrom("body_metrics")
        .select(["weight_kg", "date"])
        .where("user_id", "=", userId)
        .where("date", ">=", daysAgo(120))
        .orderBy("date", "desc")
        .executeTakeFirst(),
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

    const weeklyPlan = deriveWeeklyPlan({
      sessions: scheduleSessions.map((session) => ({
        title: session.title,
        startTime: session.start_time,
      })),
      today: now(),
    });

    return {
      today,
      weekday: weekdayName(now()),
      weeklyPlan,
      hevyLastSyncedAt: syncState?.last_success_at ?? null,
      latestWeightKg: latestWeight?.weight_kg ?? null,
      latestWeightDate: latestWeight?.date ?? null,
      recoveryLabel: label,
      recoveryExplanation: explanation,
      lastWorkout: {
        lastSessionDate,
        lastSessionFocus: classifySessionFocus(lastSessions[0]?.title ?? null),
        lastSessionSummary,
        recentVolume,
        recentWorkoutCount,
        recentSessions: lastSessions.map((session) => ({
          sessionId: session.session_id,
          title: session.title,
          startTime: session.start_time,
          totalVolumeKg: session.total_volume_kg,
          focus: classifySessionFocus(session.title),
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
              `- ${session.sessionId} [${session.focus}]: ${session.title ?? "Untitled workout"} on ${session.startTime.slice(0, 10)} (${session.totalVolumeKg ?? 0} kg volume)`,
          )
          .join("\n")
      : "- none";

  const setsBySession = new Map<string, Array<(typeof ctx.lastWorkout.recentSets)[number]>>();
  for (const set of ctx.lastWorkout.recentSets) {
    const list = setsBySession.get(set.session_id);
    if (list === undefined) {
      setsBySession.set(set.session_id, [set]);
    } else {
      list.push(set);
    }
  }
  const sessionTitleById = new Map(
    ctx.lastWorkout.recentSessions.map((session) => [session.sessionId, session.title]),
  );
  const recentSets = [...setsBySession.entries()]
    .map(([sessionId, sets]) => {
      const title = sessionTitleById.get(sessionId) ?? sessionId;
      const lines = sets
        .map((set) => {
          const load = set.weight_kg === null ? "bodyweight" : `${set.weight_kg} kg`;
          const reps = set.reps === null ? "duration-only" : `${set.reps} reps`;
          return `  - ${set.exercise_title}: ${load} x ${reps}`;
        })
        .join("\n");
      return `- ${sessionId} (${title}):\n${lines}`;
    })
    .join("\n");

  const weeklyPlanLines =
    ctx.weeklyPlan.byWeekday.length > 0
      ? ctx.weeklyPlan.byWeekday
          .map(
            (entry) =>
              `- ${weekdayNames[entry.weekday]}: ${focusLabel(entry.focus)} (${entry.occurrences}x, e.g. ${entry.titles.slice(0, 2).join(", ") || "untitled"})`,
          )
          .join("\n")
      : "- no stable pattern in the last 6 weeks";

  const todayExpected =
    ctx.weeklyPlan.todayFocus === "unknown"
      ? "no established session for this weekday in the last 6 weeks"
      : `${focusLabel(ctx.weeklyPlan.todayFocus)} (${ctx.weeklyPlan.todayFocus === ctx.lastWorkout.lastSessionFocus ? "same as last logged session" : "per weekly pattern"})`;

  const nextExpected =
    ctx.weeklyPlan.nextFocus === "unknown"
      ? "none established"
      : focusLabel(ctx.weeklyPlan.nextFocus);

  return `## Current HealthFit data

This data snapshot was read from the user's HealthFit database immediately after the Hevy freshness check. Treat it as the current source of truth. Older conversation messages and older tool results are historical context, not current workout data.

Today: ${ctx.today} (${ctx.weekday})
Expected session today (from logged history): ${todayExpected}
Next scheduled session: ${nextExpected}
Hevy last successful sync: ${ctx.hevyLastSyncedAt ?? "not connected or never synced"}
Latest recorded weight: ${
    ctx.latestWeightKg === null
      ? "none in the last 120 days"
      : `${ctx.latestWeightKg} kg on ${ctx.latestWeightDate}`
  }
Last workout: ${ctx.lastWorkout.lastSessionSummary}
Last 7 days: ${ctx.recentWorkoutCount} workouts, ${Math.round(ctx.lastWorkout.recentVolume)} kg·reps volume
Recent exercises: ${recentExercises}

Weekly schedule derived from the last 6 weeks of logged sessions:
${weeklyPlanLines}

Recent Hevy workouts:
${recentWorkouts}

Recent Hevy sets:
${recentSets}

When a question needs an exercise or set breakdown not present above, call get_session_template (or get_workout_history then get_workout_details using these current session IDs) before answering. Do not answer from an older workout result in the conversation, and never derive a session's exercise list from the Recent Hevy sets block above.`;
};

export const renderContextPrompt = (ctx: ChatContext, userMessage: string): string =>
  `${renderSystemContext(ctx)}\n\n${userMessage}`;
