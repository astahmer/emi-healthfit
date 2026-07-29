import { describe, expect, it } from "vitest";
import {
  buildWorkoutSearchOptions,
  formatWorkoutDuration,
  formatWorkoutSet,
  workoutMatchesSearch,
  type WorkoutSession,
} from "../../src/web/workouts-panel.tsx";

const sampleSession = (): WorkoutSession => ({
  session_id: "s1",
  title: "Push Day",
  start_time: "2026-07-01T10:00:00Z",
  end_time: "2026-07-01T11:00:00Z",
  duration_sec: 3600,
  total_volume_kg: 1200,
  sets: 2,
  exercises: 1,
  exerciseDetails: [
    {
      exercise_title: "Bench press",
      sets: [
        {
          set_index: 0,
          set_type: "normal",
          weight_kg: 60,
          reps: 8,
          rpe: 7,
          distance_km: null,
          duration_seconds: null,
          exercise_notes: "paused",
        },
      ],
    },
  ],
});

describe("workout panel helpers", () => {
  it("formats duration and set lines", () => {
    expect(formatWorkoutDuration(null)).toBe("—");
    expect(formatWorkoutDuration(90)).toBe("2 min");
    expect(
      formatWorkoutSet({
        set_index: 0,
        set_type: null,
        weight_kg: 40,
        reps: 10,
        rpe: null,
        distance_km: null,
        duration_seconds: null,
        exercise_notes: null,
      }),
    ).toBe("40 kg · 10 reps");
  });

  it("matches sessions by title, exercise, and set fields", () => {
    const session = sampleSession();
    expect(workoutMatchesSearch(session, "")).toBe(true);
    expect(workoutMatchesSearch(session, "push")).toBe(true);
    expect(workoutMatchesSearch(session, "bench")).toBe(true);
    expect(workoutMatchesSearch(session, "paused")).toBe(true);
    expect(workoutMatchesSearch(session, "60")).toBe(true);
    expect(workoutMatchesSearch(session, "pull")).toBe(false);
  });

  it("builds sorted search options from titles and exercises", () => {
    expect(buildWorkoutSearchOptions([sampleSession()])).toEqual([
      "Bench press",
      "normal",
      "Push Day",
    ]);
  });
});
