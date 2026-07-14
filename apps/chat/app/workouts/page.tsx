"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

interface WorkoutSet {
  set_index: number;
  set_type: string | null;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  distance_km: number | null;
  duration_seconds: number | null;
  exercise_notes: string | null;
}

interface WorkoutExercise {
  exercise_title: string;
  sets: WorkoutSet[];
}

interface WorkoutSession {
  session_id: string;
  title: string | null;
  start_time: string;
  end_time: string | null;
  duration_sec: number | null;
  total_volume_kg: number | null;
  sets: number;
  exercises: number;
  exerciseDetails: WorkoutExercise[];
}

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const formatDuration = (seconds: number | null) => {
  if (seconds === null) return "—";
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
};

const formatSet = (set: WorkoutSet): string => {
  const parts: string[] = [];
  if (set.weight_kg !== null) parts.push(`${set.weight_kg} kg`);
  if (set.reps !== null) parts.push(`${set.reps} reps`);
  if (set.distance_km !== null) parts.push(`${set.distance_km} km`);
  if (set.duration_seconds !== null) parts.push(`${Math.round(set.duration_seconds)} s`);
  if (set.rpe !== null) parts.push(`RPE ${set.rpe}`);
  if (parts.length === 0) return `Set ${set.set_index + 1}`;
  return parts.join(" · ");
};

const matchesSearch = (session: WorkoutSession, query: string): boolean => {
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

const buildSearchOptions = (sessions: WorkoutSession[]): string[] => {
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
  return Array.from(options).sort((a, b) => a.localeCompare(b));
};

export default function WorkoutsPage() {
  const [workouts, setWorkouts] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/workouts")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load workouts: ${res.status}`);
        const data = (await res.json()) as { workouts: WorkoutSession[] };
        setWorkouts(data.workouts);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const filteredWorkouts = useMemo(
    () => workouts.filter((session) => matchesSearch(session, search)),
    [workouts, search],
  );

  const searchOptions = useMemo(() => buildSearchOptions(workouts), [workouts]);

  const toggleExpanded = (sessionId: string) => {
    setExpandedId((current) => (current === sessionId ? null : sessionId));
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading workouts…
      </div>
    );
  }

  if (error !== null) {
    return <div className="flex h-full items-center justify-center text-destructive">{error}</div>;
  }

  if (workouts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No workouts found. Upload a Hevy export to get started.
      </div>
    );
  }

  return (
    <div className="mx-auto h-full max-w-5xl overflow-auto p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Workouts</h2>
        <input
          type="text"
          list="workout-options"
          placeholder="Search by exercise, set type, title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <datalist id="workout-options">
          {searchOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>

      {filteredWorkouts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No workouts match your search.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 pr-2" />
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Title</th>
              <th className="py-2 pr-4">Duration</th>
              <th className="py-2 pr-4">Exercises</th>
              <th className="py-2 pr-4">Sets</th>
              <th className="py-2 pr-4">Volume</th>
            </tr>
          </thead>
          <tbody>
            {filteredWorkouts.map((session) => (
              <Fragment key={session.session_id}>
                <tr
                  className="cursor-pointer border-b hover:bg-muted/50"
                  onClick={() => toggleExpanded(session.session_id)}
                >
                  <td className="py-2 pr-2">
                    {expandedId === session.session_id ? (
                      <ChevronUpIcon className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </td>
                  <td className="py-2 pr-4">{formatDate(session.start_time)}</td>
                  <td className="py-2 pr-4">{session.title ?? "—"}</td>
                  <td className="py-2 pr-4">{formatDuration(session.duration_sec)}</td>
                  <td className="py-2 pr-4">{session.exercises}</td>
                  <td className="py-2 pr-4">{session.sets}</td>
                  <td className="py-2 pr-4">
                    {session.total_volume_kg !== null
                      ? `${Math.round(session.total_volume_kg)} kg`
                      : "—"}
                  </td>
                </tr>
                {expandedId === session.session_id && (
                  <tr className="border-b bg-muted/30">
                    <td className="py-3 pr-2" />
                    <td colSpan={6} className="py-3 pr-4">
                      {session.exerciseDetails.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No exercise details.</p>
                      ) : (
                        <ul className="space-y-3">
                          {session.exerciseDetails.map((exercise) => (
                            <li key={exercise.exercise_title}>
                              <p className="font-medium">{exercise.exercise_title}</p>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {exercise.sets.map((set) => (
                                  <span
                                    key={set.set_index}
                                    className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-xs"
                                    title={set.exercise_notes ?? undefined}
                                  >
                                    {formatSet(set)}
                                  </span>
                                ))}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
