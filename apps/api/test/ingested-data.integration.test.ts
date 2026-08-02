import assert from "node:assert";
import { describe, it } from "node:test";
import { HealthFit, type HealthfitDatabaseSchema } from "@emi/flavor-healthfit";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";

const { getDataSummary, getRawUploadRetentionDays } = HealthFit.data;
const { deleteIngestedSource, updateRawUploadRetentionDays, updateSyncCursor } = HealthFit.ingest;
const {
  insertHealthWorkouts,
  upsertBodyMetrics,
  upsertDailyActivity,
  upsertHevySessions,
  upsertHevySets,
  upsertSleepSessions,
} = HealthFit.storage;

describe("ingested data SQLite integration", () => {
  it("upserts every import record type and tracks source-specific sync cursors", async () => {
    const { db } = makeSqliteDatabase();
    const healthfitDb = narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db);
    const userId = "user-a";

    assert.strictEqual(
      await run(
        upsertDailyActivity(healthfitDb, userId, [
          {
            date: "2026-07-01",
            active_kcal: 100,
            steps: 1_000,
            distance_km: 1.2,
            exercise_min: 15,
            flights_climbed: 3,
          },
        ]),
      ),
      1,
    );
    await run(
      upsertDailyActivity(healthfitDb, userId, [
        {
          date: "2026-07-01",
          active_kcal: 250,
          steps: 2_000,
          distance_km: 2.4,
          exercise_min: 30,
          flights_climbed: 6,
        },
      ]),
    );
    await run(
      insertHealthWorkouts(healthfitDb, userId, [
        {
          date: "2026-07-01",
          type: "Run",
          start_raw: "2026-07-01T08:00:00Z",
          duration_sec: 1_800,
          active_kcal: 350,
          avg_hr: 140,
          max_hr: 165,
          min_hr: 105,
          distance_km: 5,
          source: "apple_health",
          raw_json: '{"v":1}',
        },
      ]),
    );
    await run(
      insertHealthWorkouts(healthfitDb, userId, [
        {
          date: "2026-07-01",
          type: "Run",
          start_raw: "2026-07-01T08:00:00Z",
          duration_sec: 2_000,
          active_kcal: 400,
          avg_hr: 142,
          max_hr: 170,
          min_hr: 100,
          distance_km: 5.5,
          source: "apple_health",
          raw_json: '{"v":2}',
        },
      ]),
    );
    await run(
      upsertHevySessions(healthfitDb, userId, [
        {
          session_id: "session-a",
          provider_workout_id: null,
          source_updated_at: null,
          title: "Push",
          start_time: "2026-07-01T10:00:00Z",
          end_time: "2026-07-01T11:00:00Z",
          duration_sec: 3_600,
          total_volume_kg: 1_000,
        },
      ]),
    );
    await run(
      upsertHevySets(healthfitDb, userId, [
        {
          session_id: "session-a",
          exercise_template_id: null,
          exercise_index: 0,
          exercise_title: "Bench press",
          set_index: 1,
          set_type: "normal",
          weight_kg: 80,
          reps: 8,
          rpe: 8,
          distance_km: null,
          duration_seconds: null,
          exercise_notes: null,
        },
      ]),
    );
    await run(
      upsertHevySets(healthfitDb, userId, [
        {
          session_id: "session-a",
          exercise_template_id: null,
          exercise_index: 0,
          exercise_title: "Bench press",
          set_index: 1,
          set_type: "normal",
          weight_kg: 82.5,
          reps: 8,
          rpe: 9,
          distance_km: null,
          duration_seconds: null,
          exercise_notes: "Hard",
        },
      ]),
    );
    await run(
      upsertSleepSessions(healthfitDb, userId, [
        {
          date: "2026-07-01",
          start: "2026-06-30T22:30:00Z",
          end: "2026-07-01T06:30:00Z",
          in_bed_min: 480,
          asleep_min: 450,
          awake_min: 30,
          source: "apple_health",
        },
      ]),
    );
    await run(
      upsertBodyMetrics(healthfitDb, userId, [
        {
          date: "2026-07-01",
          weight_kg: 80,
          body_fat_pct: 15,
          lean_mass_kg: 68,
          source: "apple_health",
        },
      ]),
    );
    await run(updateSyncCursor(healthfitDb, userId, "apple_health", "2026-07-01T12:00:00Z"));
    await run(updateSyncCursor(healthfitDb, userId, "hevy", "2026-07-01T12:30:00Z"));

    assert.deepStrictEqual(
      await run(getDataSummary(narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db), userId)),
      {
        dailyActivity: 1,
        healthWorkouts: 1,
        hevySessions: 1,
        hevySets: 1,
        sleepSessions: 1,
        bodyMetrics: 1,
        lastHealthSync: "2026-07-01T12:00:00Z",
        lastHevySync: "2026-07-01T12:30:00Z",
      },
    );
  });

  it("keeps privacy preference owner-scoped and removes only selected source data", async () => {
    const { db } = makeSqliteDatabase();
    const fitnessDb = narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db);
    const alice = "user-a";
    const bob = "user-b";

    assert.strictEqual(await run(getRawUploadRetentionDays({ db: fitnessDb, userId: alice })), 30);
    await run(updateRawUploadRetentionDays({ db: fitnessDb, userId: alice, days: 14 }));
    assert.strictEqual(await run(getRawUploadRetentionDays({ db: fitnessDb, userId: alice })), 14);
    assert.strictEqual(await run(getRawUploadRetentionDays({ db: fitnessDb, userId: bob })), 30);

    await run(
      upsertDailyActivity(fitnessDb, alice, [
        {
          date: "2026-07-01",
          active_kcal: null,
          steps: 1,
          distance_km: null,
          exercise_min: null,
          flights_climbed: null,
        },
      ]),
    );
    await run(
      insertHealthWorkouts(fitnessDb, alice, [
        {
          date: "2026-07-01",
          type: "Walk",
          start_raw: "2026-07-01T08:00:00Z",
          duration_sec: null,
          active_kcal: null,
          avg_hr: null,
          max_hr: null,
          min_hr: null,
          distance_km: null,
          source: null,
          raw_json: null,
        },
      ]),
    );
    await run(
      upsertSleepSessions(fitnessDb, alice, [
        {
          date: "2026-07-01",
          start: "2026-06-30T22:00:00Z",
          end: null,
          in_bed_min: null,
          asleep_min: null,
          awake_min: null,
          source: null,
        },
      ]),
    );
    await run(
      upsertBodyMetrics(fitnessDb, alice, [
        {
          date: "2026-07-01",
          weight_kg: null,
          body_fat_pct: null,
          lean_mass_kg: null,
          source: null,
        },
      ]),
    );
    await run(
      upsertHevySessions(fitnessDb, alice, [
        {
          session_id: "session-a",
          provider_workout_id: null,
          source_updated_at: null,
          title: null,
          start_time: "2026-07-01T10:00:00Z",
          end_time: null,
          duration_sec: null,
          total_volume_kg: null,
        },
      ]),
    );
    await run(
      upsertHevySets(fitnessDb, alice, [
        {
          session_id: "session-a",
          exercise_template_id: null,
          exercise_index: 0,
          exercise_title: "Row",
          set_index: 1,
          set_type: null,
          weight_kg: null,
          reps: null,
          rpe: null,
          distance_km: null,
          duration_seconds: null,
          exercise_notes: null,
        },
      ]),
    );
    await run(updateSyncCursor(fitnessDb, alice, "apple_health", "health-sync"));
    await run(updateSyncCursor(fitnessDb, alice, "hevy", "hevy-sync"));
    await run(
      upsertDailyActivity(fitnessDb, bob, [
        {
          date: "2026-07-01",
          active_kcal: null,
          steps: 2,
          distance_km: null,
          exercise_min: null,
          flights_climbed: null,
        },
      ]),
    );

    await run(deleteIngestedSource({ db: fitnessDb, userId: alice, source: "health" }));

    assert.deepStrictEqual(await run(getDataSummary(fitnessDb, alice)), {
      dailyActivity: 0,
      healthWorkouts: 0,
      hevySessions: 1,
      hevySets: 1,
      sleepSessions: 0,
      bodyMetrics: 0,
      lastHealthSync: null,
      lastHevySync: "hevy-sync",
    });
    assert.strictEqual((await run(getDataSummary(fitnessDb, bob))).dailyActivity, 1);

    await run(deleteIngestedSource({ db: fitnessDb, userId: alice, source: "hevy" }));
    assert.strictEqual((await run(getDataSummary(fitnessDb, alice))).hevySessions, 0);
    assert.strictEqual((await run(getDataSummary(fitnessDb, alice))).hevySets, 0);
  });
});
