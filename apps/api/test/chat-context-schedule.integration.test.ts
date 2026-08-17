import assert from "node:assert";
import { describe, it } from "node:test";
import { HealthFit, type HealthfitDatabaseSchema } from "@emi/flavor-healthfit";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";

const { upsertHevySessions, upsertHevySets } = HealthFit.storage;

describe("chat context weekly schedule", () => {
  it("derives today's expected session and weekly schedule from logged history", async (testContext) => {
    testContext.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-13T12:00:00Z") });
    const { db } = makeSqliteDatabase();
    const fitnessDb = narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db);
    const userId = "user-c";

    const sessions = [
      // Full body on Tuesdays, upper on Thursdays, lower on Sundays, over 4 weeks.
      ["fb-1", "Mardi - Full body 🏋️", "2026-07-21T06:30:00Z"],
      ["up-1", "Jeudi - Upper", "2026-07-23T06:30:00Z"],
      ["lo-1", "Week-end - Lower", "2026-07-26T15:00:00Z"],
      ["fb-2", "Mardi - Full body 🏋️", "2026-07-28T06:30:00Z"],
      ["up-2", "Jeudi - Upper", "2026-07-30T06:30:00Z"],
      ["lo-2", "Week-end - Lower", "2026-08-02T15:00:00Z"],
      ["fb-3", "Mardi - Full body 🏋️", "2026-08-04T06:30:00Z"],
      ["up-3", "Jeudi - Upper", "2026-08-06T06:30:00Z"],
      ["lo-3", "Week-end - Lower", "2026-08-09T15:00:00Z"],
      ["fb-4", "Mardi - Full body 🏋️", "2026-08-11T06:30:00Z"],
    ];
    await run(
      upsertHevySessions(
        fitnessDb,
        userId,
        sessions.map(([session_id, title, start_time]) => ({
          session_id,
          provider_workout_id: null,
          source_updated_at: null,
          title,
          start_time,
          end_time: null,
          duration_sec: null,
          total_volume_kg: 1_000,
        })),
      ),
    );
    await run(
      upsertHevySets(
        fitnessDb,
        userId,
        sessions.map(([session_id]) => ({
          session_id,
          exercise_template_id: null,
          exercise_index: 0,
          exercise_title: "Exercise",
          set_index: 0,
          set_type: "normal",
          weight_kg: 10,
          reps: 10,
          rpe: null,
          distance_km: null,
          duration_seconds: null,
          exercise_notes: null,
        })),
      ),
    );

    const context = await run(HealthFit.chat.buildContext(fitnessDb, userId));
    assert.strictEqual(context.today, "2026-08-13");
    assert.strictEqual(context.weekday, "Thursday");
    assert.strictEqual(context.weeklyPlan.todayFocus, "upper");
    assert.strictEqual(context.weeklyPlan.stable, true);
    assert.strictEqual(context.weeklyPlan.nextFocus, "lower");
    const thursday = context.weeklyPlan.byWeekday.find((entry) => entry.weekday === 4);
    assert.strictEqual(thursday?.focus, "upper");
    assert.strictEqual(thursday?.occurrences, 3);
    assert.strictEqual(context.lastWorkout.lastSessionFocus, "full_body");
    const rendered = HealthFit.chat.renderSystemContext(context);
    assert.match(rendered, /Today: 2026-08-13 \(Thursday\)/);
    assert.match(rendered, /Expected session today \(from logged history\): upper/);
    assert.match(rendered, /Next scheduled session: lower/);
    assert.match(rendered, /Thursday: upper \(3x, e\.g\. Jeudi - Upper\)/);
    assert.match(rendered, /Sunday: lower/);
  });
});
