import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { Effect } from "effect";
import { assignYears, parseHealthExport } from "../src/ingest/health.ts";
import { parseHevyCsv, parseHevyDate } from "../src/ingest/hevy.ts";

describe("HealthExportKit parser", () => {
  it("parses the real health export file", async () => {
    const text = await readFile(
      "../../data/health-export-json-2022-01-01-0000_to_2026-07-13-1526.json",
      "utf8",
    );
    const result = await Effect.runPromise(parseHealthExport(text, 2022));

    assert.strictEqual(result.daily.length, 1655);
    assert.strictEqual(result.workouts.length, 572);
    assert.strictEqual(result.sleep.length, 918);
    assert.strictEqual(result.body.length, 158);

    assert.strictEqual(result.workouts[0]?.date, "2022-01-01");
    assert.strictEqual(result.workouts.at(-1)?.date, "2026-07-07");

    const workoutTypes = new Set(result.workouts.map((w) => w.type));
    assert.deepStrictEqual(
      workoutTypes,
      new Set(["Cycling", "Elliptical", "Strength Training", "Walking"]),
    );

    const firstSleep = result.sleep[0];
    assert.ok(firstSleep);
    assert.ok(firstSleep.start);
    assert.ok(firstSleep.end);
    assert.match(firstSleep.start, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.match(firstSleep.end, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("assigns years to chronologically ordered timestamps without explicit year", () => {
    const timestamps = ["01-01 10:00:00", "12-31 23:00:00", "01-01 10:00:00", "06-15 12:00:00"];
    const dates = assignYears(timestamps, 2022);

    assert.strictEqual(dates[0]?.toISOString().slice(0, 10), "2022-01-01");
    assert.strictEqual(dates[1]?.toISOString().slice(0, 10), "2022-12-31");
    assert.strictEqual(dates[2]?.toISOString().slice(0, 10), "2023-01-01");
    assert.strictEqual(dates[3]?.toISOString().slice(0, 10), "2023-06-15");
  });
});

describe("Hevy CSV parser", () => {
  it("parses the real Hevy export file", async () => {
    const text = await readFile("../../data/hevy/workout_data.csv", "utf8");
    const result = await Effect.runPromise(parseHevyCsv(text));

    assert.strictEqual(result.sessions.length, 110);
    assert.strictEqual(result.sets.length, 1840);

    const firstSet = result.sets[0];
    assert.ok(firstSet);
    assert.strictEqual(firstSet.exercise_title, "Leg Press Horizontal (Machine)");
    assert.strictEqual(firstSet.weight_kg, 80);
    assert.strictEqual(firstSet.reps, 11);

    const totalVolume = result.sessions.reduce(
      (sum, session) => sum + (session.total_volume_kg ?? 0),
      0,
    );
    assert.ok(totalVolume > 0);
  });

  it("parses Hevy date format", async () => {
    const date = await Effect.runPromise(parseHevyDate("12 Jul 2026, 15:11"));
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    assert.strictEqual(local, "2026-07-12T15:11");
  });

  it("rejects invalid Hevy date format", async () => {
    await assert.rejects(
      () => Effect.runPromise(parseHevyDate("2026-07-12 15:11")),
      /Unexpected Hevy date format/,
    );
  });
});
