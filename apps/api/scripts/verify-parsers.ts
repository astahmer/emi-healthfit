import { Effect } from "effect";
import { readFile } from "node:fs/promises";
import { parseHealthExport } from "../src/ingest/health.ts";
import { parseHevyCsv } from "../src/ingest/hevy.ts";

const run = async () => {
  const healthText = await readFile(
    "../../data/health-export-json-2022-01-01-0000_to_2026-07-13-1526.json",
    "utf8",
  );
  const health = await Effect.runPromise(parseHealthExport(healthText, 2022));
  console.log("Health export parsed:");
  console.log("  daily:", health.daily.length);
  console.log("  workouts:", health.workouts.length);
  console.log("  sleep:", health.sleep.length);
  console.log("  body:", health.body.length);
  console.log("  first workout date:", health.workouts[0]?.date);
  console.log("  last workout date:", health.workouts.at(-1)?.date);

  const hevyText = await readFile("../../data/hevy/workout_data.csv", "utf8");
  const hevy = await Effect.runPromise(parseHevyCsv(hevyText));
  console.log("\nHevy CSV parsed:");
  console.log("  sessions:", hevy.sessions.length);
  console.log("  sets:", hevy.sets.length);
  console.log("  first session:", hevy.sessions[0]?.start_time);
  console.log("  last session:", hevy.sessions.at(-1)?.start_time);
  console.log("  total volume:", hevy.sessions.reduce((sum, s) => sum + (s.total_volume_kg ?? 0), 0));
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
