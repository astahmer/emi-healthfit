"use client";

import { memo, type FC } from "react";
import { cn } from "@/lib/utils";

interface WorkoutHistoryItem {
  session_id: string;
  title: string | null;
  start_time: string;
  total_volume_kg: number | null;
  exercise_count: number;
  set_count: number;
}

interface ExerciseProgressSet {
  session_id: string;
  title: string | null;
  start_time: string;
  max_weight_kg: number | null;
  max_volume_kg: number | null;
  total_volume_kg: number | null;
  total_reps: number | null;
  sets: number;
}

interface ExerciseProgress {
  exercise_title: string;
  weeks: number;
  workouts: ExerciseProgressSet[];
  personalRecord: {
    weight_kg: number | null;
    reps: number | null;
    volume_kg: number | null;
  };
}

interface RecoveryResult {
  today?: string;
  label?: string;
  explanation?: string;
  lastWorkout?: string | null;
  sleepAverageHours?: number | null;
  recentWorkoutCount?: number;
  recentVolume?: number | null;
}

interface Citation {
  title?: string;
  url?: string;
  content?: string;
}

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

const parseResult = (result: unknown): unknown => {
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }
  return result;
};

const isWorkoutHistory = (value: unknown): value is WorkoutHistoryItem[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      typeof item === "object" && item !== null && "session_id" in item && "start_time" in item,
  );

const isExerciseProgress = (value: unknown): value is ExerciseProgress =>
  typeof value === "object" &&
  value !== null &&
  "exercise_title" in value &&
  Array.isArray((value as ExerciseProgress).workouts);

const isRecoveryResult = (value: unknown): value is RecoveryResult =>
  typeof value === "object" && value !== null && ("label" in value || "explanation" in value);

const getCitations = (value: unknown): Citation[] | undefined => {
  if (typeof value !== "object" || value === null) return undefined;

  const obj = value as Record<string, unknown>;

  for (const key of ["results", "sources", "citations"]) {
    const candidate = obj[key];
    if (
      Array.isArray(candidate) &&
      candidate.every((item) => typeof item === "object" && item !== null)
    ) {
      return candidate as Citation[];
    }
  }

  return undefined;
};

const Table: FC<{ headers: string[]; rows: React.ReactNode[][] }> = ({ headers, rows }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b">
            {headers.map((header) => (
              <th key={header} className="pb-1 pr-3 font-medium text-muted-foreground">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-border/50 last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="py-1.5 pr-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const WorkoutHistoryTable: FC<{ items: WorkoutHistoryItem[] }> = ({ items }) => {
  return (
    <Table
      headers={["Date", "Workout", "Volume", "Exercises", "Sets"]}
      rows={items.map((item) => [
        formatDate(item.start_time),
        item.title ?? "Untitled",
        item.total_volume_kg !== null ? `${item.total_volume_kg.toFixed(1)} kg` : "—",
        String(item.exercise_count),
        String(item.set_count),
      ])}
    />
  );
};

const ExerciseProgressView: FC<{ data: ExerciseProgress }> = ({ data }) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
          {data.exercise_title}
        </span>
        <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          {data.weeks} weeks
        </span>
        {data.personalRecord.weight_kg !== null && (
          <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            PR: {data.personalRecord.weight_kg} kg × {data.personalRecord.reps ?? "—"}
          </span>
        )}
      </div>
      <Table
        headers={["Date", "Max weight", "Volume", "Sets", "Reps"]}
        rows={data.workouts.map((workout) => [
          formatDate(workout.start_time),
          workout.max_weight_kg !== null ? `${workout.max_weight_kg.toFixed(1)} kg` : "—",
          workout.total_volume_kg !== null ? `${workout.total_volume_kg.toFixed(1)} kg` : "—",
          String(workout.sets),
          workout.total_reps !== null ? String(workout.total_reps) : "—",
        ])}
      />
    </div>
  );
};

const RecoveryCard: FC<{ data: RecoveryResult }> = ({ data }) => {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {data.label !== undefined && (
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Recovery</p>
          <p className="text-lg font-semibold">{data.label}</p>
        </div>
      )}
      {data.sleepAverageHours !== undefined && data.sleepAverageHours !== null && (
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Sleep average</p>
          <p className="text-lg font-semibold">{data.sleepAverageHours.toFixed(1)} h</p>
        </div>
      )}
      {data.lastWorkout !== undefined && data.lastWorkout !== null && (
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Last workout</p>
          <p className="text-sm">{data.lastWorkout}</p>
        </div>
      )}
      {data.recentVolume !== undefined && data.recentVolume !== null && (
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Recent volume</p>
          <p className="text-lg font-semibold">{data.recentVolume.toFixed(1)} kg</p>
        </div>
      )}
      {data.explanation !== undefined && (
        <div className="col-span-full rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Why</p>
          <p className="text-sm">{data.explanation}</p>
        </div>
      )}
    </div>
  );
};

const WebSearchCitations: FC<{ citations: Citation[] }> = ({ citations }) => {
  return (
    <div className="flex flex-col gap-2">
      {citations.map((citation, index) => (
        <div key={index} className="rounded-lg border p-3">
          {citation.title !== undefined && (
            <p className="font-medium text-sm">
              {citation.url !== undefined ? (
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {citation.title}
                </a>
              ) : (
                citation.title
              )}
            </p>
          )}
          {citation.content !== undefined && (
            <p className="text-muted-foreground mt-1 text-xs">{citation.content}</p>
          )}
        </div>
      ))}
    </div>
  );
};

export interface ToolResultContentProps {
  toolName: string;
  result?: unknown;
  className?: string;
}

const ToolResultContentImpl: FC<ToolResultContentProps> = ({ toolName, result, className }) => {
  const parsed = parseResult(result);

  if (toolName === "get_workout_history" && isWorkoutHistory(parsed)) {
    return <WorkoutHistoryTable items={parsed} />;
  }

  if (toolName === "get_exercise_progress" && isExerciseProgress(parsed)) {
    return <ExerciseProgressView data={parsed} />;
  }

  if (toolName === "get_recovery" && isRecoveryResult(parsed)) {
    return <RecoveryCard data={parsed} />;
  }

  const citations = getCitations(parsed);
  if ((toolName === "web_search" || toolName === "web-search") && citations !== undefined) {
    return <WebSearchCitations citations={citations} />;
  }

  return (
    <pre
      className={cn(
        "bg-muted/50 text-foreground/90 mt-1 rounded-md p-2.5 text-xs whitespace-pre-wrap",
        className,
      )}
    >
      {typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}
    </pre>
  );
};

export const ToolResultContent = memo(ToolResultContentImpl);
ToolResultContent.displayName = "ToolResultContent";
