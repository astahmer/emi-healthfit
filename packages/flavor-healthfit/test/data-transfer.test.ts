import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ingestedDataExportSchema } from "../src/ingest/data-transfer.ts";

const emptyExport = {
  version: 1 as const,
  exportedAt: "2026-07-21T00:00:00.000Z",
  health: { dailyActivity: [], workouts: [], sleepSessions: [], bodyMetrics: [] },
  hevy: { sessions: [], sets: [] },
  syncCursors: [],
};

describe("ingestedDataExportSchema", () => {
  it("accepts the versioned export envelope", () => {
    expect(Option.isSome(Schema.decodeUnknownOption(ingestedDataExportSchema)(emptyExport))).toBe(
      true,
    );
  });

  it("rejects unknown export versions before any import", () => {
    expect(
      Option.isNone(
        Schema.decodeUnknownOption(ingestedDataExportSchema)({ ...emptyExport, version: 2 }),
      ),
    ).toBe(true);
  });

  it("rejects payloads missing health groups", () => {
    const { health: _health, ...rest } = emptyExport;
    expect(Option.isNone(Schema.decodeUnknownOption(ingestedDataExportSchema)(rest))).toBe(true);
  });

  it("accepts a populated health and hevy payload", () => {
    const populated = {
      ...emptyExport,
      health: {
        dailyActivity: [
          {
            date: "2026-07-01",
            active_kcal: 100,
            steps: 1000,
            distance_km: 1,
            exercise_min: 10,
            flights_climbed: 1,
          },
        ],
        workouts: [
          {
            date: "2026-07-01",
            type: "Run",
            start_raw: "2026-07-01T08:00:00Z",
            duration_sec: 1800,
            active_kcal: 300,
            avg_hr: 140,
            max_hr: 160,
            min_hr: 100,
            distance_km: 5,
            source: "apple_health",
            raw_json: null,
          },
        ],
        sleepSessions: [
          {
            date: "2026-07-01",
            start: "2026-06-30T22:00:00Z",
            end: "2026-07-01T06:00:00Z",
            in_bed_min: 480,
            asleep_min: 420,
            awake_min: 60,
            source: "apple_health",
          },
        ],
        bodyMetrics: [
          {
            date: "2026-07-01",
            weight_kg: 80,
            body_fat_pct: null,
            lean_mass_kg: null,
            source: "apple_health",
          },
        ],
      },
      hevy: {
        sessions: [
          {
            session_id: "s1",
            provider_workout_id: "p1",
            source_updated_at: null,
            title: "Push",
            start_time: "2026-07-01T10:00:00Z",
            end_time: "2026-07-01T11:00:00Z",
            duration_sec: 3600,
            total_volume_kg: 1000,
          },
        ],
        sets: [
          {
            session_id: "s1",
            exercise_template_id: null,
            exercise_index: 0,
            exercise_title: "Bench",
            set_index: 0,
            set_type: "normal",
            weight_kg: 60,
            reps: 8,
            rpe: null,
            distance_km: null,
            duration_seconds: null,
            exercise_notes: null,
          },
        ],
      },
      syncCursors: [{ source: "hevy", last_sync: "2026-07-01T12:00:00Z" }],
    };
    expect(Option.isSome(Schema.decodeUnknownOption(ingestedDataExportSchema)(populated))).toBe(
      true,
    );
  });
});
