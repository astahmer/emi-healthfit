import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { Effect } from "effect";
import { HealthFit } from "@emi/flavor-healthfit";

const { assignYears, parseHealthExport, parseHevyCsv, parseHevyDate } = HealthFit.ingest;

describe("HealthExportKit parser", () => {
  it("parses the versioned anonymized health export fixture", async () => {
    const text = await readFile(
      new URL("./fixtures/ingest/health-export.json", import.meta.url),
      "utf8",
    );
    const result = await Effect.runPromise(parseHealthExport(text, 2024));

    assert.strictEqual(result.daily.length, 2);
    assert.strictEqual(result.workouts.length, 2);
    assert.strictEqual(result.sleep.length, 2);
    assert.strictEqual(result.body.length, 2);

    assert.strictEqual(result.workouts[0]?.date, "2024-01-02");
    assert.strictEqual(result.workouts.at(-1)?.date, "2024-12-31");

    const workoutTypes = new Set(result.workouts.map((w) => w.type));
    assert.deepStrictEqual(workoutTypes, new Set(["Running", "Strength Training"]));

    const firstSleep = result.sleep[0];
    assert.ok(firstSleep);
    assert.ok(firstSleep.start);
    assert.ok(firstSleep.end);
    assert.match(firstSleep.start, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.match(firstSleep.end, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("parses exports without a sleep section", async () => {
    const text = await readFile(
      new URL("./fixtures/ingest/health-export-without-sleep.json", import.meta.url),
      "utf8",
    );
    const result = await Effect.runPromise(parseHealthExport(text, 2026));

    assert.strictEqual(result.daily.length, 1);
    assert.strictEqual(result.workouts.length, 1);
    assert.strictEqual(result.sleep.length, 0);
    assert.strictEqual(result.body.length, 0);
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
  it("parses the versioned anonymized Hevy export fixture", async () => {
    const text = await readFile(
      new URL("./fixtures/ingest/hevy-workouts.csv", import.meta.url),
      "utf8",
    );
    const result = await Effect.runPromise(parseHevyCsv(text));

    assert.strictEqual(result.sessions.length, 2);
    assert.strictEqual(result.sets.length, 3);

    const firstSet = result.sets[0];
    assert.ok(firstSet);
    assert.strictEqual(firstSet.exercise_title, "Goblet Squat");
    assert.strictEqual(firstSet.weight_kg, 20);
    assert.strictEqual(firstSet.reps, 10);

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
