import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { QueryDatabaseClient } from "../../platform/db/client.ts";
import {
  insertHealthWorkouts,
  upsertBodyMetrics,
  upsertDailyActivity,
  upsertHevySessions,
  upsertHevySets,
  upsertSleepSessions,
} from "../db/ingested-data.ts";

const NullableNumber = Schema.NullOr(Schema.Number);
const NullableString = Schema.NullOr(Schema.String);

export const ingestedDataExportSchema = Schema.Struct({
  version: Schema.Literal(1),
  exportedAt: Schema.String,
  health: Schema.Struct({
    dailyActivity: Schema.Array(
      Schema.Struct({
        date: Schema.String,
        active_kcal: NullableNumber,
        steps: NullableNumber,
        distance_km: NullableNumber,
        exercise_min: NullableNumber,
        flights_climbed: NullableNumber,
      }),
    ),
    workouts: Schema.Array(
      Schema.Struct({
        id: Schema.optional(Schema.Number),
        date: Schema.String,
        type: Schema.String,
        start_raw: NullableString,
        duration_sec: NullableNumber,
        active_kcal: NullableNumber,
        avg_hr: NullableNumber,
        max_hr: NullableNumber,
        min_hr: NullableNumber,
        distance_km: NullableNumber,
        source: NullableString,
        raw_json: NullableString,
      }),
    ),
    sleepSessions: Schema.Array(
      Schema.Struct({
        date: NullableString,
        start: NullableString,
        end: NullableString,
        in_bed_min: NullableNumber,
        asleep_min: NullableNumber,
        awake_min: NullableNumber,
        source: NullableString,
      }),
    ),
    bodyMetrics: Schema.Array(
      Schema.Struct({
        date: Schema.String,
        weight_kg: NullableNumber,
        body_fat_pct: NullableNumber,
        lean_mass_kg: NullableNumber,
        source: NullableString,
      }),
    ),
  }),
  hevy: Schema.Struct({
    sessions: Schema.Array(
      Schema.Struct({
        session_id: Schema.String,
        provider_workout_id: Schema.optional(NullableString),
        source_updated_at: Schema.optional(NullableString),
        title: NullableString,
        start_time: Schema.String,
        end_time: NullableString,
        duration_sec: NullableNumber,
        total_volume_kg: NullableNumber,
      }),
    ),
    sets: Schema.Array(
      Schema.Struct({
        id: Schema.optional(Schema.Number),
        session_id: Schema.String,
        exercise_template_id: Schema.optional(NullableString),
        exercise_index: Schema.optional(Schema.Int),
        exercise_title: Schema.String,
        set_index: Schema.Int,
        set_type: NullableString,
        weight_kg: NullableNumber,
        reps: NullableNumber,
        rpe: NullableNumber,
        distance_km: NullableNumber,
        duration_seconds: NullableNumber,
        exercise_notes: NullableString,
      }),
    ),
  }),
  syncCursors: Schema.Array(Schema.Struct({ source: Schema.String, last_sync: NullableString })),
});

export type IngestedDataExport = typeof ingestedDataExportSchema.Type;

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
  const kysely = yield* db.kysely;
  const [daily, workouts, sleep, body, sessions, sets] = yield* Effect.all([
    Effect.promise(() =>
      kysely.selectFrom("daily_activity").select("date").where("user_id", "=", userId).execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("health_workouts")
        .select(["date", "type", "start_raw"])
        .where("user_id", "=", userId)
        .execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("sleep_sessions")
        .select(["date", "start"])
        .where("user_id", "=", userId)
        .execute(),
    ),
    Effect.promise(() =>
      kysely.selectFrom("body_metrics").select("date").where("user_id", "=", userId).execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("hevy_sessions")
        .select("session_id")
        .where("user_id", "=", userId)
        .execute(),
    ),
    Effect.promise(() =>
      kysely
        .selectFrom("hevy_sets")
        .select(["session_id", "exercise_index", "set_index"])
        .where("user_id", "=", userId)
        .execute(),
    ),
  ]);
  const keys = {
    daily: new Set(daily.map((row) => row.date)),
    workouts: new Set(workouts.map((row) => combinedKey(row.date, row.type, row.start_raw))),
    sleep: new Set(sleep.map((row) => combinedKey(row.date, row.start))),
    body: new Set(body.map((row) => row.date)),
    sessions: new Set(sessions.map((row) => row.session_id)),
    sets: new Set(
      sets.map((row) => combinedKey(row.session_id, row.exercise_index, row.set_index)),
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
        keys.sets.has(combinedKey(row.session_id, row.exercise_index ?? 0, row.set_index)),
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
  yield* upsertHevySessions(
    db,
    userId,
    data.hevy.sessions.map((session) => ({
      ...session,
      provider_workout_id: session.provider_workout_id ?? null,
      source_updated_at: session.source_updated_at ?? null,
    })),
  );
  yield* Effect.all([
    upsertDailyActivity(db, userId, data.health.dailyActivity),
    insertHealthWorkouts(db, userId, data.health.workouts),
    upsertSleepSessions(db, userId, data.health.sleepSessions),
    upsertBodyMetrics(db, userId, data.health.bodyMetrics),
    upsertHevySets(
      db,
      userId,
      data.hevy.sets.map((set) => ({
        ...set,
        exercise_template_id: set.exercise_template_id ?? null,
        exercise_index: set.exercise_index ?? 0,
      })),
    ),
  ]);
});
