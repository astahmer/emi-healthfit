import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

const fitnessSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/db/fitness.ts"),
  "utf8",
);

const functionBody = (name: string): string => {
  const marker = `export const ${name}`;
  const start = fitnessSource.indexOf(marker);
  assert.ok(start >= 0, `missing ${name}`);
  const nextExport = fitnessSource.indexOf("\nexport const ", start + marker.length);
  return nextExport === -1 ? fitnessSource.slice(start) : fitnessSource.slice(start, nextExport);
};

describe("fitness SQL aggregate shapes", () => {
  it("keeps workout history on COUNT DISTINCT / COUNT + GROUP BY", () => {
    const body = functionBody("getWorkoutHistory");
    assert.match(body, /eb\.fn\.count/);
    assert.match(body, /\.distinct\(\)/);
    assert.match(body, /\.groupBy\(/);
    assert.doesNotMatch(body, /selectAll\(\)/);
  });

  it("keeps sleep trend on COUNT / AVG aggregates", () => {
    const body = functionBody("getSleepTrend");
    assert.match(body, /eb\.fn\.countAll/);
    assert.match(body, /eb\.fn\.avg/);
  });

  it("keeps data summary on COUNT(*) style aggregates", () => {
    const body = functionBody("getDataSummary");
    assert.match(body, /eb\.fn\.countAll/);
  });

  it("keeps exercise progress on MAX / SUM / COUNT aggregates", () => {
    const body = functionBody("getExerciseProgress");
    assert.match(body, /eb\.fn\.max/);
    assert.match(body, /eb\.fn\.sum/);
    assert.match(body, /eb\.fn\.countAll/);
  });

  it("keeps analytics overview on SUM / COUNT GROUP BY", () => {
    const body = functionBody("getAnalyticsOverview");
    assert.match(body, /eb\.fn\.sum/);
    assert.match(body, /eb\.fn\.countAll/);
    assert.match(body, /\.groupBy\(/);
  });
});
