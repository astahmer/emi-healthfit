import assert from "node:assert";
import { describe, it } from "node:test";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ingestedDataExportSchema } from "../src/healthfit/ingest/data-transfer.ts";

const emptyExport = {
  version: 1,
  exportedAt: "2026-07-15T00:00:00.000Z",
  health: { dailyActivity: [], workouts: [], sleepSessions: [], bodyMetrics: [] },
  hevy: { sessions: [], sets: [] },
  syncCursors: [],
};

describe("ingested data transfer", () => {
  it("accepts the versioned export envelope", () => {
    assert.strictEqual(
      Option.isSome(Schema.decodeUnknownOption(ingestedDataExportSchema)(emptyExport)),
      true,
    );
  });

  it("rejects unknown export versions before any import", () => {
    assert.strictEqual(
      Option.isNone(
        Schema.decodeUnknownOption(ingestedDataExportSchema)({ ...emptyExport, version: 2 }),
      ),
      true,
    );
  });
});
