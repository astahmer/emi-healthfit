import assert from "node:assert";
import { describe, it } from "node:test";
import { ingestedDataExportSchema } from "../src/ingest/data-transfer.ts";

const emptyExport = {
  version: 1,
  exportedAt: "2026-07-15T00:00:00.000Z",
  health: { dailyActivity: [], workouts: [], sleepSessions: [], bodyMetrics: [] },
  hevy: { sessions: [], sets: [] },
  syncCursors: [],
};

describe("ingested data transfer", () => {
  it("accepts the versioned export envelope", () => {
    assert.strictEqual(ingestedDataExportSchema.safeParse(emptyExport).success, true);
  });

  it("rejects unknown export versions before any import", () => {
    assert.strictEqual(
      ingestedDataExportSchema.safeParse({ ...emptyExport, version: 2 }).success,
      false,
    );
  });
});
