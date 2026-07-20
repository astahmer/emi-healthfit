import assert from "node:assert";
import { describe, it } from "node:test";
import type { HealthfitDatabaseSchema } from "@emi/flavor-healthfit";
import {
  getAnalyticsOverview,
  getDataSummary,
  getExerciseProgress,
  getIngestedDataExport,
  getIngestedDataExportSummary,
  getSleepTrend,
  getWorkoutDetails,
  getWorkoutHistory,
  getWorkouts,
  getWorkoutStreak,
} from "../src/healthfit/db/fitness.ts";
import {
  insertHealthWorkouts,
  updateSyncCursor,
  upsertBodyMetrics,
  upsertDailyActivity,
  upsertHevySessions,
  upsertHevySets,
  upsertSleepSessions,
} from "../src/healthfit/db/ingested-data.ts";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";

describe("fitness SQLite integration", () => {
  it("returns owner-scoped history, progress, trends, exports, and analytics from persisted data", async () => {
    const { db, sqlite } = makeSqliteDatabase();
    const fitnessDb = narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db);
    const userId = "user-a";

    await run(
      upsertDailyActivity(db, userId, [
        {
          date: "2026-07-18",
          active_kcal: 300,
          steps: 1_000,
          distance_km: 1.5,
          exercise_min: 30,
          flights_climbed: 2,
        },
        {
          date: "2026-07-19",
          active_kcal: 500,
          steps: 3_000,
          distance_km: 4.5,
          exercise_min: 60,
          flights_climbed: 8,
        },
      ]),
    );
    await run(
      insertHealthWorkouts(db, userId, [
        {
          date: "2026-07-18",
          type: "Run",
          start_raw: "2026-07-18T07:00:00Z",
          duration_sec: 1_800,
          active_kcal: 300,
          avg_hr: 140,
          max_hr: 160,
          min_hr: 110,
          distance_km: 5,
          source: "apple_health",
          raw_json: null,
        },
      ]),
    );
    await run(
      upsertSleepSessions(db, userId, [
        {
          date: "2026-07-18",
          start: "2026-07-17T22:00:00Z",
          end: "2026-07-18T06:00:00Z",
          in_bed_min: 480,
          asleep_min: 420,
          awake_min: 60,
          source: "apple_health",
        },
        {
          date: "2026-07-19",
          start: "2026-07-18T22:00:00Z",
          end: "2026-07-19T06:30:00Z",
          in_bed_min: 510,
          asleep_min: 480,
          awake_min: 30,
          source: "apple_health",
        },
      ]),
    );
    await run(
      upsertBodyMetrics(db, userId, [
        {
          date: "2026-07-18",
          weight_kg: 80,
          body_fat_pct: 16,
          lean_mass_kg: 67.2,
          source: "apple_health",
        },
        {
          date: "2026-07-19",
          weight_kg: 79,
          body_fat_pct: 15.8,
          lean_mass_kg: 66.5,
          source: "apple_health",
        },
      ]),
    );
    await run(
      upsertHevySessions(db, userId, [
        {
          session_id: "session-a",
          provider_workout_id: null,
          source_updated_at: null,
          title: "Upper",
          start_time: "2026-07-18T10:00:00Z",
          end_time: "2026-07-18T11:00:00Z",
          duration_sec: 3_600,
          total_volume_kg: 640,
        },
        {
          session_id: "session-b",
          provider_workout_id: null,
          source_updated_at: null,
          title: "Strength",
          start_time: "2026-07-19T10:00:00Z",
          end_time: "2026-07-19T11:15:00Z",
          duration_sec: 4_500,
          total_volume_kg: 1_210,
        },
      ]),
    );
    await run(
      upsertHevySets(db, userId, [
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
        {
          session_id: "session-b",
          exercise_template_id: null,
          exercise_index: 0,
          exercise_title: "Bench press",
          set_index: 1,
          set_type: "normal",
          weight_kg: 85,
          reps: 6,
          rpe: 9,
          distance_km: null,
          duration_seconds: null,
          exercise_notes: null,
        },
        {
          session_id: "session-b",
          exercise_template_id: null,
          exercise_index: 1,
          exercise_title: "Squat",
          set_index: 1,
          set_type: "normal",
          weight_kg: 85,
          reps: 8,
          rpe: 8,
          distance_km: null,
          duration_seconds: null,
          exercise_notes: "Controlled",
        },
      ]),
    );
    await run(updateSyncCursor(db, userId, "apple_health", "health-sync"));
    await run(updateSyncCursor(db, userId, "hevy", "hevy-sync"));

    assert.deepStrictEqual(await run(getDataSummary(fitnessDb, userId)), {
      dailyActivity: 2,
      healthWorkouts: 1,
      hevySessions: 2,
      hevySets: 3,
      sleepSessions: 2,
      bodyMetrics: 2,
      lastHealthSync: "health-sync",
      lastHevySync: "hevy-sync",
    });
    assert.deepStrictEqual(
      (await run(getWorkoutHistory(fitnessDb, userId))).map((workout) => ({
        id: workout.session_id,
        exercises: workout.exercise_count,
        sets: workout.set_count,
      })),
      [
        { id: "session-b", exercises: 2, sets: 2 },
        { id: "session-a", exercises: 1, sets: 1 },
      ],
    );
    assert.deepStrictEqual(
      await run(getWorkoutDetails({ db: fitnessDb, userId, sessionId: "session-b" })),
      {
        sessionId: "session-b",
        title: "Strength",
        startTime: "2026-07-19T10:00:00Z",
        endTime: "2026-07-19T11:15:00Z",
        durationSeconds: 4_500,
        totalVolumeKg: 1_210,
        exercises: [
          {
            title: "Bench press",
            volumeKg: 510,
            sets: [
              {
                session_id: "session-b",
                session_title: "Strength",
                start_time: "2026-07-19T10:00:00Z",
                end_time: "2026-07-19T11:15:00Z",
                duration_sec: 4_500,
                session_volume_kg: 1_210,
                set_index: 1,
                set_type: "normal",
                weight_kg: 85,
                reps: 6,
                rpe: 9,
              },
            ],
          },
          {
            title: "Squat",
            volumeKg: 680,
            sets: [
              {
                session_id: "session-b",
                session_title: "Strength",
                start_time: "2026-07-19T10:00:00Z",
                end_time: "2026-07-19T11:15:00Z",
                duration_sec: 4_500,
                session_volume_kg: 1_210,
                set_index: 1,
                set_type: "normal",
                weight_kg: 85,
                reps: 8,
                rpe: 8,
              },
            ],
          },
        ],
      },
    );
    assert.deepStrictEqual(await run(getExerciseProgress(fitnessDb, userId, "Bench press", 4)), {
      exercise_title: "Bench press",
      weeks: 4,
      workouts: [
        {
          session_id: "session-a",
          title: "Upper",
          start_time: "2026-07-18T10:00:00Z",
          max_weight_kg: 80,
          max_volume_kg: 640,
          total_volume_kg: 640,
          total_reps: 8,
          sets: 1,
        },
        {
          session_id: "session-b",
          title: "Strength",
          start_time: "2026-07-19T10:00:00Z",
          max_weight_kg: 85,
          max_volume_kg: 510,
          total_volume_kg: 510,
          total_reps: 6,
          sets: 1,
        },
      ],
      personalRecord: { weight_kg: 80, reps: 8, volume_kg: 640 },
    });
    assert.deepStrictEqual(await run(getSleepTrend(fitnessDb, userId, 7)), {
      days: 2,
      avg_in_bed_min: 495,
      avg_asleep_min: 450,
      avg_awake_min: 45,
      avg_sleep_hours: 7.5,
    });
    const exported = await run(getIngestedDataExport({ db: fitnessDb, userId }));
    assert.deepStrictEqual(
      {
        daily: exported.health.dailyActivity.length,
        health: exported.health.workouts.length,
        sleep: exported.health.sleepSessions.length,
        body: exported.health.bodyMetrics.length,
        sessions: exported.hevy.sessions.length,
        sets: exported.hevy.sets.length,
        cursors: exported.syncCursors.length,
      },
      { daily: 2, health: 1, sleep: 2, body: 2, sessions: 2, sets: 3, cursors: 2 },
    );
    assert.deepStrictEqual(await run(getIngestedDataExportSummary({ db: fitnessDb, userId })), {
      sources: {
        dailyActivity: { count: 2, first: "2026-07-18", last: "2026-07-19" },
        healthWorkouts: { count: 1, first: "2026-07-18", last: "2026-07-18" },
        sleepSessions: { count: 2, first: "2026-07-18", last: "2026-07-19" },
        bodyMetrics: { count: 2, first: "2026-07-18", last: "2026-07-19" },
        hevySessions: { count: 2, first: "2026-07-18T10:00:00Z", last: "2026-07-19T10:00:00Z" },
        hevySets: { count: 3, first: null, last: null },
      },
      totalRecords: 12,
      healthRange: { first: "2026-07-18", last: "2026-07-19" },
      hevyRange: { first: "2026-07-18T10:00:00Z", last: "2026-07-19T10:00:00Z" },
    });
    assert.deepStrictEqual(
      (await run(getWorkouts(fitnessDb, userId))).map((workout) => ({
        id: workout.session_id,
        exercises: workout.exercises,
        exerciseDetails: workout.exerciseDetails.map((exercise) => exercise.exercise_title),
      })),
      [
        { id: "session-b", exercises: 2, exerciseDetails: ["Bench press", "Squat"] },
        { id: "session-a", exercises: 1, exerciseDetails: ["Bench press"] },
      ],
    );
    const analytics = await run(getAnalyticsOverview({ db: fitnessDb, userId, days: 7 }));
    assert.deepStrictEqual(analytics.highlights, {
      averageSteps: 2_000,
      averageSleepMinutes: 450,
      workouts: 2,
      trainingVolumeKg: 1_850,
      weightChangeKg: -1,
    });
    sqlite.prepare("DELETE FROM hevy_sets WHERE user_id = ?").run(userId);
    sqlite.prepare("DELETE FROM hevy_sessions WHERE user_id = ?").run(userId);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await run(
      upsertHevySessions(db, userId, [
        {
          session_id: "streak-yesterday",
          provider_workout_id: null,
          source_updated_at: null,
          title: "Streak",
          start_time: `${yesterday}T12:00:00Z`,
          end_time: null,
          duration_sec: null,
          total_volume_kg: null,
        },
        {
          session_id: "streak-today",
          provider_workout_id: null,
          source_updated_at: null,
          title: "Streak",
          start_time: `${today}T12:00:00Z`,
          end_time: null,
          duration_sec: null,
          total_volume_kg: null,
        },
      ]),
    );
    assert.deepStrictEqual(await run(getWorkoutStreak(fitnessDb, userId)), {
      current_streak: 2,
      longest_streak: 2,
      last_workout_date: today,
    });
  });
});
