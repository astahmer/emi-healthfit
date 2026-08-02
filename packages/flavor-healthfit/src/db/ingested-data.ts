import * as Effect from "effect/Effect";
import type { Compilable } from "kysely";
import { runBatches, runTransaction, type QueryDatabaseClient } from "@emi/core/server/legacy";
import type {
  BodyMetricRow,
  DailyActivityRow,
  HealthWorkoutRow,
  HealthfitDatabaseSchema,
  HevySessionRow,
  HevySetRow,
  SleepSessionRow,
} from "./schema.ts";

type FitnessDb = QueryDatabaseClient<HealthfitDatabaseSchema>;

export const upsertDailyActivity = (
  db: FitnessDb,
  userId: string,
  rows: ReadonlyArray<DailyActivityRow>,
) =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;
    const kysely = yield* db.kysely;
    const statements = rows.map((row) =>
      kysely
        .insertInto("daily_activity")
        .values({ user_id: userId, ...row })
        .onConflict((conflict) =>
          conflict.columns(["user_id", "date"]).doUpdateSet((expressionBuilder) => ({
            active_kcal: expressionBuilder.ref("excluded.active_kcal"),
            distance_km: expressionBuilder.ref("excluded.distance_km"),
            exercise_min: expressionBuilder.ref("excluded.exercise_min"),
            flights_climbed: expressionBuilder.ref("excluded.flights_climbed"),
            steps: expressionBuilder.ref("excluded.steps"),
          })),
        ),
    );
    yield* runBatches(db, statements);
    return rows.length;
  });

export const insertHealthWorkouts = (
  db: FitnessDb,
  userId: string,
  rows: ReadonlyArray<HealthWorkoutRow>,
) =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;
    const kysely = yield* db.kysely;
    const statements = rows.map((row) =>
      kysely
        .insertInto("health_workouts")
        .values({ user_id: userId, ...row })
        .onConflict((conflict) =>
          conflict
            .columns(["user_id", "date", "type", "start_raw"])
            .doUpdateSet((expressionBuilder) => ({
              active_kcal: expressionBuilder.ref("excluded.active_kcal"),
              avg_hr: expressionBuilder.ref("excluded.avg_hr"),
              distance_km: expressionBuilder.ref("excluded.distance_km"),
              duration_sec: expressionBuilder.ref("excluded.duration_sec"),
              max_hr: expressionBuilder.ref("excluded.max_hr"),
              min_hr: expressionBuilder.ref("excluded.min_hr"),
              raw_json: expressionBuilder.ref("excluded.raw_json"),
              source: expressionBuilder.ref("excluded.source"),
            })),
        ),
    );
    yield* runBatches(db, statements);
    return rows.length;
  });

export const upsertHevySessions = (
  db: FitnessDb,
  userId: string,
  rows: ReadonlyArray<HevySessionRow>,
) =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;
    const kysely = yield* db.kysely;
    const statements = rows.map((row) =>
      kysely
        .insertInto("hevy_sessions")
        .values({ user_id: userId, ...row })
        .onConflict((conflict) =>
          conflict.columns(["user_id", "session_id"]).doUpdateSet((expressionBuilder) => ({
            duration_sec: expressionBuilder.ref("excluded.duration_sec"),
            end_time: expressionBuilder.ref("excluded.end_time"),
            provider_workout_id: expressionBuilder.ref("excluded.provider_workout_id"),
            source_updated_at: expressionBuilder.ref("excluded.source_updated_at"),
            title: expressionBuilder.ref("excluded.title"),
            total_volume_kg: expressionBuilder.ref("excluded.total_volume_kg"),
          })),
        ),
    );
    yield* runBatches(db, statements);
    return rows.length;
  });

export const upsertHevySets = (db: FitnessDb, userId: string, rows: ReadonlyArray<HevySetRow>) =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;
    const kysely = yield* db.kysely;
    const statements = rows.map((row) =>
      kysely
        .insertInto("hevy_sets")
        .values({ user_id: userId, ...row })
        .onConflict((conflict) =>
          conflict
            .columns(["user_id", "session_id", "exercise_index", "set_index"])
            .doUpdateSet((expressionBuilder) => ({
              distance_km: expressionBuilder.ref("excluded.distance_km"),
              duration_seconds: expressionBuilder.ref("excluded.duration_seconds"),
              exercise_notes: expressionBuilder.ref("excluded.exercise_notes"),
              exercise_template_id: expressionBuilder.ref("excluded.exercise_template_id"),
              exercise_title: expressionBuilder.ref("excluded.exercise_title"),
              reps: expressionBuilder.ref("excluded.reps"),
              rpe: expressionBuilder.ref("excluded.rpe"),
              set_type: expressionBuilder.ref("excluded.set_type"),
              weight_kg: expressionBuilder.ref("excluded.weight_kg"),
            })),
        ),
    );
    yield* runBatches(db, statements);
    return rows.length;
  });

export const upsertSleepSessions = (
  db: FitnessDb,
  userId: string,
  rows: ReadonlyArray<SleepSessionRow>,
) =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;
    const kysely = yield* db.kysely;
    const statements = rows.map((row) =>
      kysely
        .insertInto("sleep_sessions")
        .values({ user_id: userId, ...row })
        .onConflict((conflict) =>
          conflict.columns(["user_id", "date", "start"]).doUpdateSet((expressionBuilder) => ({
            asleep_min: expressionBuilder.ref("excluded.asleep_min"),
            awake_min: expressionBuilder.ref("excluded.awake_min"),
            end: expressionBuilder.ref("excluded.end"),
            in_bed_min: expressionBuilder.ref("excluded.in_bed_min"),
            source: expressionBuilder.ref("excluded.source"),
          })),
        ),
    );
    yield* runBatches(db, statements);
    return rows.length;
  });

export const upsertBodyMetrics = (
  db: FitnessDb,
  userId: string,
  rows: ReadonlyArray<BodyMetricRow>,
) =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0;
    const kysely = yield* db.kysely;
    const statements = rows.map((row) =>
      kysely
        .insertInto("body_metrics")
        .values({ user_id: userId, ...row })
        .onConflict((conflict) =>
          conflict.columns(["user_id", "date"]).doUpdateSet((expressionBuilder) => ({
            body_fat_pct: expressionBuilder.ref("excluded.body_fat_pct"),
            lean_mass_kg: expressionBuilder.ref("excluded.lean_mass_kg"),
            source: expressionBuilder.ref("excluded.source"),
            weight_kg: expressionBuilder.ref("excluded.weight_kg"),
          })),
        ),
    );
    yield* runBatches(db, statements);
    return rows.length;
  });

export const updateSyncCursor = (db: FitnessDb, userId: string, source: string, lastSync: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* Effect.promise(() =>
      kysely
        .insertInto("sync_cursors")
        .values({ user_id: userId, source, last_sync: lastSync })
        .onConflict((conflict) =>
          conflict.columns(["user_id", "source"]).doUpdateSet({ last_sync: lastSync }),
        )
        .execute(),
    );
  });

export const getRawUploadRetentionDays = Effect.fn("privacy.readRetention")(function* ({
  db,
  userId,
}: {
  db: QueryDatabaseClient<HealthfitDatabaseSchema>;
  userId: string;
}) {
  const kysely = yield* db.kysely;
  const row = yield* Effect.promise(() =>
    kysely
      .selectFrom("privacy_preferences")
      .select("raw_upload_retention_days as days")
      .where("user_id", "=", userId)
      .executeTakeFirst(),
  );
  return row?.days ?? 30;
});

export const updateRawUploadRetentionDays = Effect.fn("privacy.updateRetention")(function* ({
  db,
  userId,
  days,
}: {
  db: QueryDatabaseClient<HealthfitDatabaseSchema>;
  userId: string;
  days: number;
}) {
  const kysely = yield* db.kysely;
  yield* Effect.promise(() =>
    kysely
      .insertInto("privacy_preferences")
      .values({
        raw_upload_retention_days: days,
        updated_at: new Date().toISOString(),
        user_id: userId,
      })
      .onConflict((conflict) =>
        conflict.column("user_id").doUpdateSet({
          raw_upload_retention_days: days,
          updated_at: new Date().toISOString(),
        }),
      )
      .execute(),
  );
});

export const deleteIngestedSource = Effect.fn("privacy.deleteSource")(function* ({
  db,
  userId,
  source,
}: {
  db: QueryDatabaseClient<HealthfitDatabaseSchema>;
  userId: string;
  source: "health" | "hevy";
}) {
  const kysely = yield* db.kysely;
  const statements: Array<Compilable<unknown>> =
    source === "health"
      ? [
          kysely.deleteFrom("daily_activity").where("user_id", "=", userId),
          kysely.deleteFrom("health_workouts").where("user_id", "=", userId),
          kysely.deleteFrom("sleep_sessions").where("user_id", "=", userId),
          kysely.deleteFrom("body_metrics").where("user_id", "=", userId),
        ]
      : [
          kysely.deleteFrom("hevy_sets").where("user_id", "=", userId),
          kysely.deleteFrom("hevy_sessions").where("user_id", "=", userId),
          kysely.deleteFrom("hevy_connections").where("user_id", "=", userId),
          kysely.deleteFrom("hevy_sync_state").where("user_id", "=", userId),
        ];
  statements.push(
    kysely
      .deleteFrom("sync_cursors")
      .where("user_id", "=", userId)
      .where("source", "=", source === "health" ? "apple_health" : "hevy"),
  );
  yield* runTransaction(db, statements);
});
