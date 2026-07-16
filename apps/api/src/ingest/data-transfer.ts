import * as Effect from "effect/Effect";
import { z } from "zod";
import {
  insertHealthWorkouts,
  type QueryDatabaseClient,
  upsertBodyMetrics,
  upsertDailyActivity,
  upsertHevySessions,
  upsertHevySets,
  upsertSleepSessions,
} from "../db/operations.ts";

const nullableNumber = z.number().nullable();
const nullableString = z.string().nullable();

export const ingestedDataExportSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  health: z.object({
    dailyActivity: z.array(
      z.object({
        date: z.string(),
        active_kcal: nullableNumber,
        steps: nullableNumber,
        distance_km: nullableNumber,
        exercise_min: nullableNumber,
        flights_climbed: nullableNumber,
      }),
    ),
    workouts: z.array(
      z.object({
        id: z.number().optional(),
        date: z.string(),
        type: z.string(),
        start_raw: nullableString,
        duration_sec: nullableNumber,
        active_kcal: nullableNumber,
        avg_hr: nullableNumber,
        max_hr: nullableNumber,
        min_hr: nullableNumber,
        distance_km: nullableNumber,
        source: nullableString,
        raw_json: nullableString,
      }),
    ),
    sleepSessions: z.array(
      z.object({
        date: nullableString,
        start: nullableString,
        end: nullableString,
        in_bed_min: nullableNumber,
        asleep_min: nullableNumber,
        awake_min: nullableNumber,
        source: nullableString,
      }),
    ),
    bodyMetrics: z.array(
      z.object({
        date: z.string(),
        weight_kg: nullableNumber,
        body_fat_pct: nullableNumber,
        lean_mass_kg: nullableNumber,
        source: nullableString,
      }),
    ),
  }),
  hevy: z.object({
    sessions: z.array(
      z.object({
        session_id: z.string(),
        title: nullableString,
        start_time: z.string(),
        end_time: nullableString,
        duration_sec: nullableNumber,
        total_volume_kg: nullableNumber,
      }),
    ),
    sets: z.array(
      z.object({
        id: z.number().optional(),
        session_id: z.string(),
        exercise_title: z.string(),
        set_index: z.number().int(),
        set_type: nullableString,
        weight_kg: nullableNumber,
        reps: nullableNumber,
        rpe: nullableNumber,
        distance_km: nullableNumber,
        duration_seconds: nullableNumber,
        exercise_notes: nullableString,
      }),
    ),
  }),
  syncCursors: z.array(z.object({ source: z.string(), last_sync: nullableString })),
});

export type IngestedDataExport = z.infer<typeof ingestedDataExportSchema>;

interface ImportCount {
  received: number;
  existing: number;
  new: number;
}

interface IngestedDataImportPreview {
  groups: Record<
    | "dailyActivity"
    | "healthWorkouts"
    | "sleepSessions"
    | "bodyMetrics"
    | "hevySessions"
    | "hevySets",
    ImportCount
  >;
  totals: ImportCount;
}

const count = (received: number, existing: number): ImportCount => ({
  received,
  existing,
  new: received - existing,
});

const combinedKey = (...parts: Array<string | number | null>): string => parts.join("\u0000");

export const previewIngestedDataImport = Effect.fn("dataImport.preview")(function* ({
  db,
  userId,
  data,
}: {
  db: QueryDatabaseClient;
  userId: string;
  data: IngestedDataExport;
}) {
  const [daily, workouts, sleep, body, sessions, sets] = yield* Effect.all([
    db
      .prepare("SELECT date FROM daily_activity WHERE user_id = ?")
      .bind(userId)
      .all<{ date: string }>(),
    db
      .prepare("SELECT date, type, start_raw FROM health_workouts WHERE user_id = ?")
      .bind(userId)
      .all<{ date: string; type: string; start_raw: string | null }>(),
    db
      .prepare("SELECT date, start FROM sleep_sessions WHERE user_id = ?")
      .bind(userId)
      .all<{ date: string | null; start: string | null }>(),
    db
      .prepare("SELECT date FROM body_metrics WHERE user_id = ?")
      .bind(userId)
      .all<{ date: string }>(),
    db
      .prepare("SELECT session_id FROM hevy_sessions WHERE user_id = ?")
      .bind(userId)
      .all<{ session_id: string }>(),
    db
      .prepare("SELECT session_id, exercise_title, set_index FROM hevy_sets WHERE user_id = ?")
      .bind(userId)
      .all<{ session_id: string; exercise_title: string; set_index: number }>(),
  ]);
  const keys = {
    daily: new Set(daily.results.map((row) => row.date)),
    workouts: new Set(
      workouts.results.map((row) => combinedKey(row.date, row.type, row.start_raw)),
    ),
    sleep: new Set(sleep.results.map((row) => combinedKey(row.date, row.start))),
    body: new Set(body.results.map((row) => row.date)),
    sessions: new Set(sessions.results.map((row) => row.session_id)),
    sets: new Set(
      sets.results.map((row) => combinedKey(row.session_id, row.exercise_title, row.set_index)),
    ),
  };
  const groups = {
    dailyActivity: count(
      data.health.dailyActivity.length,
      data.health.dailyActivity.filter((row) => keys.daily.has(row.date)).length,
    ),
    healthWorkouts: count(
      data.health.workouts.length,
      data.health.workouts.filter((row) =>
        keys.workouts.has(combinedKey(row.date, row.type, row.start_raw)),
      ).length,
    ),
    sleepSessions: count(
      data.health.sleepSessions.length,
      data.health.sleepSessions.filter((row) => keys.sleep.has(combinedKey(row.date, row.start)))
        .length,
    ),
    bodyMetrics: count(
      data.health.bodyMetrics.length,
      data.health.bodyMetrics.filter((row) => keys.body.has(row.date)).length,
    ),
    hevySessions: count(
      data.hevy.sessions.length,
      data.hevy.sessions.filter((row) => keys.sessions.has(row.session_id)).length,
    ),
    hevySets: count(
      data.hevy.sets.length,
      data.hevy.sets.filter((row) =>
        keys.sets.has(combinedKey(row.session_id, row.exercise_title, row.set_index)),
      ).length,
    ),
  } satisfies IngestedDataImportPreview["groups"];
  const values = Object.values(groups);
  return {
    groups,
    totals: count(
      values.reduce((total, item) => total + item.received, 0),
      values.reduce((total, item) => total + item.existing, 0),
    ),
  } satisfies IngestedDataImportPreview;
});

export const importIngestedData = Effect.fn("dataImport.apply")(function* ({
  db,
  userId,
  data,
}: {
  db: QueryDatabaseClient;
  userId: string;
  data: IngestedDataExport;
}) {
  yield* upsertHevySessions(db, userId, data.hevy.sessions);
  yield* Effect.all([
    upsertDailyActivity(db, userId, data.health.dailyActivity),
    insertHealthWorkouts(db, userId, data.health.workouts),
    upsertSleepSessions(db, userId, data.health.sleepSessions),
    upsertBodyMetrics(db, userId, data.health.bodyMetrics),
    upsertHevySets(db, userId, data.hevy.sets),
  ]);
});
