import assert from "node:assert";
import { describe, it } from "node:test";
import { buildChatContext } from "../src/healthfit/chat/context.ts";
import { getDataSummary } from "../src/healthfit/db/fitness.ts";
import {
  importIngestedData,
  type IngestedDataExport,
  previewIngestedDataImport,
} from "../src/healthfit/ingest/data-transfer.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";

const data: IngestedDataExport = {
  version: 1,
  exportedAt: "2026-07-19T12:00:00.000Z",
  health: {
    dailyActivity: [
      {
        date: "2026-07-19",
        active_kcal: 350,
        steps: 4_000,
        distance_km: 3,
        exercise_min: 40,
        flights_climbed: 5,
      },
    ],
    workouts: [
      {
        date: "2026-07-19",
        type: "Walk",
        start_raw: "2026-07-19T08:00:00Z",
        duration_sec: 1_800,
        active_kcal: 150,
        avg_hr: 100,
        max_hr: 120,
        min_hr: 80,
        distance_km: 2.5,
        source: "apple_health",
        raw_json: null,
      },
    ],
    sleepSessions: [
      {
        date: "2026-07-19",
        start: "2026-07-18T22:30:00Z",
        end: "2026-07-19T06:30:00Z",
        in_bed_min: 480,
        asleep_min: 450,
        awake_min: 30,
        source: "apple_health",
      },
    ],
    bodyMetrics: [
      {
        date: "2026-07-19",
        weight_kg: 80,
        body_fat_pct: 15,
        lean_mass_kg: 68,
        source: "apple_health",
      },
    ],
  },
  hevy: {
    sessions: [
      {
        session_id: "session-a",
        title: "Full body",
        start_time: "2026-07-19T10:00:00Z",
        end_time: "2026-07-19T11:00:00Z",
        duration_sec: 3_600,
        total_volume_kg: 400,
      },
    ],
    sets: [
      {
        session_id: "session-a",
        exercise_title: "Goblet squat",
        set_index: 1,
        set_type: "normal",
        weight_kg: 50,
        reps: 8,
        rpe: 8,
        distance_km: null,
        duration_seconds: null,
        exercise_notes: null,
      },
    ],
  },
  syncCursors: [],
};

describe("data service SQLite integration", () => {
  it("previews import collisions, imports every data group, and builds a persisted chat context", async () => {
    const { db } = makeSqliteDatabase();
    const userId = "user-a";

    assert.deepStrictEqual(await run(previewIngestedDataImport({ db, userId, data })), {
      groups: {
        dailyActivity: { received: 1, existing: 0, new: 1 },
        healthWorkouts: { received: 1, existing: 0, new: 1 },
        sleepSessions: { received: 1, existing: 0, new: 1 },
        bodyMetrics: { received: 1, existing: 0, new: 1 },
        hevySessions: { received: 1, existing: 0, new: 1 },
        hevySets: { received: 1, existing: 0, new: 1 },
      },
      totals: { received: 6, existing: 0, new: 6 },
    });
    await run(importIngestedData({ db, userId, data }));
    assert.deepStrictEqual(await run(previewIngestedDataImport({ db, userId, data })), {
      groups: {
        dailyActivity: { received: 1, existing: 1, new: 0 },
        healthWorkouts: { received: 1, existing: 1, new: 0 },
        sleepSessions: { received: 1, existing: 1, new: 0 },
        bodyMetrics: { received: 1, existing: 1, new: 0 },
        hevySessions: { received: 1, existing: 1, new: 0 },
        hevySets: { received: 1, existing: 1, new: 0 },
      },
      totals: { received: 6, existing: 6, new: 0 },
    });
    assert.deepStrictEqual(await run(getDataSummary(db, userId)), {
      dailyActivity: 1,
      healthWorkouts: 1,
      hevySessions: 1,
      hevySets: 1,
      sleepSessions: 1,
      bodyMetrics: 1,
      lastHealthSync: null,
      lastHevySync: null,
    });

    const context = await run(buildChatContext(db, userId));
    assert.deepStrictEqual(
      {
        lastSessionDate: context.lastWorkout.lastSessionDate,
        lastSessionSummary: context.lastWorkout.lastSessionSummary,
        recentVolume: context.lastWorkout.recentVolume,
        recentWorkoutCount: context.recentWorkoutCount,
        sleepAverage: context.sleep.averageMinutes,
        lastNight: context.sleep.lastNight?.date,
      },
      {
        lastSessionDate: "2026-07-19",
        lastSessionSummary: "Full body on 2026-07-19",
        recentVolume: 400,
        recentWorkoutCount: 1,
        sleepAverage: 450,
        lastNight: "2026-07-19",
      },
    );
    assert.strictEqual(typeof context.recoveryLabel, "string");
    assert.strictEqual(typeof context.recoveryExplanation, "string");
  });
});
