export interface WorkoutSet {
  set_index: number;
  set_type: string | null;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  distance_km: number | null;
  duration_seconds: number | null;
  exercise_notes: string | null;
}

export const formatWorkoutDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

export const formatWorkoutDuration = (seconds: number | null) => {
  if (seconds === null) return "—";
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
};

export const formatWorkoutSet = (set: WorkoutSet): string => {
  const parts: string[] = [];
  if (set.weight_kg !== null) parts.push(`${set.weight_kg} kg`);
  if (set.reps !== null) parts.push(`${set.reps} reps`);
  if (set.distance_km !== null) parts.push(`${set.distance_km} km`);
  if (set.duration_seconds !== null) parts.push(`${Math.round(set.duration_seconds)} s`);
  if (set.rpe !== null) parts.push(`RPE ${set.rpe}`);
  if (parts.length === 0) return `Set ${set.set_index + 1}`;
  return parts.join(" · ");
};
