import type { WorkoutSession } from "./workouts-panel.tsx";

export const workoutMatchesSearch = (session: WorkoutSession, query: string): boolean => {
  if (query.trim() === "") return true;
  const term = query.toLowerCase();
  if (session.title?.toLowerCase().includes(term)) return true;
  for (const exercise of session.exerciseDetails) {
    if (exercise.exercise_title.toLowerCase().includes(term)) return true;
    for (const set of exercise.sets) {
      if (set.set_type?.toLowerCase().includes(term)) return true;
      if (set.exercise_notes?.toLowerCase().includes(term)) return true;
      if (String(set.reps ?? "").includes(term)) return true;
      if (String(set.weight_kg ?? "").includes(term)) return true;
      if (String(set.rpe ?? "").includes(term)) return true;
    }
  }
  return false;
};

export const buildWorkoutSearchOptions = (sessions: WorkoutSession[]): string[] => {
  const options = new Set<string>();
  for (const session of sessions) {
    if (session.title !== null) options.add(session.title);
    for (const exercise of session.exerciseDetails) {
      options.add(exercise.exercise_title);
      for (const set of exercise.sets) {
        if (set.set_type !== null) options.add(set.set_type);
      }
    }
  }
  return Array.from(options).toSorted((a, b) => a.localeCompare(b));
};
