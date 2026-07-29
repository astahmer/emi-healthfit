import assert from "node:assert/strict";
import { Effect } from "effect";
import { readFile } from "node:fs/promises";
import { parseHealthExport } from "../src/healthfit/ingest/health.ts";
import { parseHevyCsv } from "../src/healthfit/ingest/hevy.ts";

const run = async () => {
  const healthText = await readFile(
    new URL("../test/fixtures/ingest/health-export.json", import.meta.url),
    "utf8",
  );
  const health = await Effect.runPromise(parseHealthExport(healthText, 2024));
  assert.deepEqual(
    {
      daily: health.daily.length,
      workouts: health.workouts.length,
      sleep: health.sleep.length,
      body: health.body.length,
    },
    { daily: 2, workouts: 2, sleep: 2, body: 2 },
  );
  console.log("Health export parsed:");
  console.log("  daily:", health.daily.length);
  console.log("  workouts:", health.workouts.length);
  console.log("  sleep:", health.sleep.length);
  console.log("  body:", health.body.length);
  console.log("  first workout date:", health.workouts[0]?.date);
  console.log("  last workout date:", health.workouts.at(-1)?.date);

  const hevyText = await readFile(
    new URL("../test/fixtures/ingest/hevy-workouts.csv", import.meta.url),
    "utf8",
  );
  const hevy = await Effect.runPromise(parseHevyCsv(hevyText));
  assert.deepEqual(
    { sessions: hevy.sessions.length, sets: hevy.sets.length },
    { sessions: 2, sets: 3 },
  );
  console.log("\nHevy CSV parsed:");
  console.log("  sessions:", hevy.sessions.length);
  console.log("  sets:", hevy.sets.length);
  console.log("  first session:", hevy.sessions[0]?.start_time);
  console.log("  last session:", hevy.sessions.at(-1)?.start_time);
  console.log(
    "  total volume:",
    hevy.sessions.reduce((sum, s) => sum + (s.total_volume_kg ?? 0), 0),
  );
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
