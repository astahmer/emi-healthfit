import type { HevySessionRow, HevySetRow } from "../../db/schema.ts";
import type { Schemas } from "./generated/hevy-api.generated.ts";

export const hevySessionIdForProviderWorkout = (providerWorkoutId: string) =>
  `hevy:${providerWorkoutId}`;

const toLocalDateTime = (iso: string | undefined) => {
  if (iso === undefined || iso.trim() === "") return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const durationSeconds = ({
  startTime,
  endTime,
}: {
  startTime: string | null;
  endTime: string | null;
}) => {
  if (startTime === null || endTime === null) return null;
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
};

export const mapHevyWorkoutToRows = (
  workout: Schemas.Workout,
): { session: HevySessionRow; sets: HevySetRow[] } | null => {
  const providerWorkoutId = workout.id?.trim();
  if (providerWorkoutId === undefined || providerWorkoutId === "") return null;

  const startTime = toLocalDateTime(workout.start_time) ?? toLocalDateTime(workout.created_at);
  if (startTime === null) return null;

  const endTime = toLocalDateTime(workout.end_time);
  const exercises = workout.exercises ?? [];
  const sets: HevySetRow[] = [];

  for (const [fallbackIndex, exercise] of exercises.entries()) {
    const exerciseIndex =
      typeof exercise.index === "number" && Number.isFinite(exercise.index)
        ? exercise.index
        : fallbackIndex;
    const exerciseTitle = exercise.title?.trim() || "Exercise";
    const exerciseSets = exercise.sets ?? [];

    for (const [setFallbackIndex, set] of exerciseSets.entries()) {
      const setIndex =
        typeof set.index === "number" && Number.isFinite(set.index)
          ? set.index
          : setFallbackIndex + 1;
      const distanceMeters = set.distance_meters;
      sets.push({
        session_id: hevySessionIdForProviderWorkout(providerWorkoutId),
        exercise_template_id: exercise.exercise_template_id ?? null,
        exercise_index: exerciseIndex,
        exercise_title: exerciseTitle,
        set_index: setIndex,
        set_type: set.type ?? null,
        weight_kg: set.weight_kg ?? null,
        reps: set.reps ?? null,
        rpe: set.rpe ?? null,
        distance_km: typeof distanceMeters === "number" ? distanceMeters / 1000 : null,
        duration_seconds: set.duration_seconds ?? null,
        exercise_notes: exercise.notes ?? null,
      });
    }
  }

  const totalVolumeKg = sets.reduce((sum, set) => {
    if (set.weight_kg !== null && set.reps !== null) {
      return sum + set.weight_kg * set.reps;
    }
    return sum;
  }, 0);

  return {
    session: {
      session_id: hevySessionIdForProviderWorkout(providerWorkoutId),
      provider_workout_id: providerWorkoutId,
      source_updated_at: workout.updated_at ?? workout.created_at ?? null,
      title: workout.title ?? null,
      start_time: startTime,
      end_time: endTime,
      duration_sec: durationSeconds({ startTime, endTime }),
      total_volume_kg: totalVolumeKg,
    },
    sets,
  };
};
