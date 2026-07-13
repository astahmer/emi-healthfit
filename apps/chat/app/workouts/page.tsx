"use client";

import { useEffect, useState } from "react";

interface WorkoutSession {
  session_id: string;
  title: string | null;
  start_time: string;
  end_time: string | null;
  duration_sec: number | null;
  total_volume_kg: number | null;
  sets: number;
  exercises: number;
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

export default function WorkoutsPage() {
  const [workouts, setWorkouts] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <div className="mx-auto h-full max-w-4xl overflow-auto p-6">
      <h2 className="mb-4 text-xl font-semibold">Workouts</h2>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Title</th>
            <th className="py-2 pr-4">Duration</th>
            <th className="py-2 pr-4">Exercises</th>
            <th className="py-2 pr-4">Sets</th>
            <th className="py-2 pr-4">Volume</th>
          </tr>
        </thead>
        <tbody>
          {workouts.map((session) => (
            <tr key={session.session_id} className="border-b">
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
