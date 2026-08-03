"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { runApi } from "./api-client.ts";
import { healthFitQueryKeys } from "./query-keys.ts";
import {
  formatWorkoutDate,
  formatWorkoutDuration,
  formatWorkoutSet,
} from "./workout-formatters.ts";
import type { WorkoutSet } from "./workout-formatters.ts";
import { buildWorkoutSearchOptions, workoutMatchesSearch } from "./workout-search.ts";

export interface WorkoutExercise {
  exercise_title: string;
  sets: WorkoutSet[];
}

export interface WorkoutSession {
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

type WorkoutResponse = {
  readonly workouts: ReadonlyArray<{
    readonly session_id: string;
    readonly title: string | null;
    readonly start_time: string;
    readonly end_time: string | null;
    readonly duration_sec: number | null;
    readonly total_volume_kg: number | null;
    readonly sets: number;
    readonly exercises: number;
    readonly exerciseDetails: ReadonlyArray<{
      readonly exercise_title: string;
      readonly sets: ReadonlyArray<WorkoutSet>;
    }>;
  }>;
};

const fetchWorkouts = async (): Promise<WorkoutSession[]> => {
  const data = await runApi<WorkoutResponse, unknown>((client) => client.workouts.list());
  return data.workouts.map((workout) => ({
    ...workout,
    exerciseDetails: workout.exerciseDetails.map((exercise) => ({
      ...exercise,
      sets: [...exercise.sets],
    })),
  }));
};

export const WorkoutsPanel = () => {
  const {
    data: workouts = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: healthFitQueryKeys.workouts.all,
    queryFn: fetchWorkouts,
  });
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredWorkouts = useMemo(
    () => workouts.filter((session) => workoutMatchesSearch(session, search)),
    [workouts, search],
  );

  const searchOptions = useMemo(() => buildWorkoutSearchOptions(workouts), [workouts]);

  const toggleExpanded = (sessionId: string) => {
    setExpandedId((current) => (current === sessionId ? null : sessionId));
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading workouts…
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="flex h-full items-center justify-center text-destructive">
        {error.message}
      </div>
    );
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
          aria-label="Search workouts"
          placeholder="Search by exercise, set type, title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-input bg-background placeholder:text-muted-foreground focus:ring-ring w-full max-w-sm rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
        <datalist id="workout-options">
          {searchOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>

      {filteredWorkouts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No workouts match your search.</p>
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
                <tr className="hover:bg-muted/50 border-b">
                  <td className="py-2 pr-2">
                    <button
                      type="button"
                      className="rounded p-1 hover:bg-muted"
                      aria-label={`${expandedId === session.session_id ? "Collapse" : "Expand"} ${session.title ?? "workout"}`}
                      aria-expanded={expandedId === session.session_id}
                      onClick={() => toggleExpanded(session.session_id)}
                    >
                      {expandedId === session.session_id ? (
                        <ChevronUpIcon className="text-muted-foreground h-4 w-4" />
                      ) : (
                        <ChevronDownIcon className="text-muted-foreground h-4 w-4" />
                      )}
                    </button>
                  </td>
                  <td className="py-2 pr-4">{formatWorkoutDate(session.start_time)}</td>
                  <td className="py-2 pr-4">{session.title ?? "—"}</td>
                  <td className="py-2 pr-4">{formatWorkoutDuration(session.duration_sec)}</td>
                  <td className="py-2 pr-4">{session.exercises}</td>
                  <td className="py-2 pr-4">{session.sets}</td>
                  <td className="py-2 pr-4">
                    {session.total_volume_kg !== null
                      ? `${Math.round(session.total_volume_kg)} kg`
                      : "—"}
                  </td>
                </tr>
                {expandedId === session.session_id && (
                  <tr className="bg-muted/30 border-b">
                    <td className="py-3 pr-2" />
                    <td colSpan={6} className="py-3 pr-4">
                      {session.exerciseDetails.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No exercise details.</p>
                      ) : (
                        <ul className="space-y-3">
                          {session.exerciseDetails.map((exercise) => (
                            <li key={exercise.exercise_title}>
                              <p className="font-medium">{exercise.exercise_title}</p>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {exercise.sets.map((set) => (
                                  <span
                                    key={set.set_index}
                                    className="bg-background inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
                                    title={set.exercise_notes ?? undefined}
                                  >
                                    {formatWorkoutSet(set)}
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
};
