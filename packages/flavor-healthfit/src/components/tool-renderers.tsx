"use client";

import { useMemo, type FC, type ReactNode } from "react";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "../lib/cn.ts";

interface WorkoutHistoryItem {
  readonly session_id: string;
  readonly title: string | null;
  readonly start_time: string;
  readonly total_volume_kg: number | null;
  readonly exercise_count: number;
  readonly set_count: number;
}

interface ExerciseProgressSet {
  readonly session_id: string;
  readonly title: string | null;
  readonly start_time: string;
  readonly max_weight_kg: number | null;
  readonly max_volume_kg: number | null;
  readonly total_volume_kg: number | null;
  readonly total_reps: number | null;
  readonly sets: number;
}

interface ExerciseProgress {
  readonly exercise_title: string;
  readonly weeks: number;
  readonly workouts: ReadonlyArray<ExerciseProgressSet>;
  readonly personalRecord: {
    readonly weight_kg: number | null;
    readonly reps: number | null;
    readonly volume_kg: number | null;
  };
}

interface RecoveryResult {
  readonly today?: string;
  readonly label?: string;
  readonly explanation?: string;
  readonly lastWorkout?: string | null;
  readonly sleepAverageHours?: number | null;
  readonly recentWorkoutCount?: number;
  readonly recentVolume?: number | null;
}

interface SleepTrend {
  readonly days: number;
  readonly avg_in_bed_min: number | null;
  readonly avg_asleep_min: number | null;
  readonly avg_awake_min: number | null;
  readonly avg_sleep_hours: number | null;
  readonly nights: ReadonlyArray<{
    readonly date: string;
    readonly in_bed_min: number | null;
    readonly asleep_min: number | null;
    readonly awake_min: number | null;
  }>;
}

interface WorkoutStreak {
  readonly current_streak: number;
  readonly longest_streak: number;
  readonly last_workout_date: string | null;
}

const WorkoutHistory = Schema.Array(
  Schema.Struct({
    session_id: Schema.String,
    title: Schema.NullOr(Schema.String),
    start_time: Schema.String,
    total_volume_kg: Schema.NullOr(Schema.Number),
    exercise_count: Schema.Number,
    set_count: Schema.Number,
  }),
);
const ExerciseProgressSchema = Schema.Struct({
  exercise_title: Schema.String,
  weeks: Schema.Number,
  workouts: Schema.Array(
    Schema.Struct({
      session_id: Schema.String,
      title: Schema.NullOr(Schema.String),
      start_time: Schema.String,
      max_weight_kg: Schema.NullOr(Schema.Number),
      max_volume_kg: Schema.NullOr(Schema.Number),
      total_volume_kg: Schema.NullOr(Schema.Number),
      total_reps: Schema.NullOr(Schema.Number),
      sets: Schema.Number,
    }),
  ),
  personalRecord: Schema.Struct({
    weight_kg: Schema.NullOr(Schema.Number),
    reps: Schema.NullOr(Schema.Number),
    volume_kg: Schema.NullOr(Schema.Number),
  }),
});
const RecoveryResultSchema = Schema.Struct({
  today: Schema.optional(Schema.String),
  label: Schema.optional(Schema.String),
  explanation: Schema.optional(Schema.String),
  lastWorkout: Schema.optional(Schema.NullOr(Schema.String)),
  sleepAverageHours: Schema.optional(Schema.NullOr(Schema.Number)),
  recentWorkoutCount: Schema.optional(Schema.Number),
  recentVolume: Schema.optional(Schema.NullOr(Schema.Number)),
});
const SleepTrendSchema = Schema.Struct({
  days: Schema.Number,
  avg_in_bed_min: Schema.NullOr(Schema.Number),
  avg_asleep_min: Schema.NullOr(Schema.Number),
  avg_awake_min: Schema.NullOr(Schema.Number),
  avg_sleep_hours: Schema.NullOr(Schema.Number),
  nights: Schema.Array(
    Schema.Struct({
      date: Schema.String,
      in_bed_min: Schema.NullOr(Schema.Number),
      asleep_min: Schema.NullOr(Schema.Number),
      awake_min: Schema.NullOr(Schema.Number),
    }),
  ),
});
const WorkoutStreakSchema = Schema.Struct({
  current_streak: Schema.Number,
  longest_streak: Schema.Number,
  last_workout_date: Schema.NullOr(Schema.String),
});
const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
const formatSleepDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return `${hours}h ${remainder.toString().padStart(2, "0")}m`;
};

const workoutHistoryHeaders = ["Date", "Workout", "Volume", "Exercises", "Sets"];
const exerciseProgressHeaders = ["Date", "Max weight", "Volume", "Sets", "Reps"];
const sleepTrendHeaders = ["Date", "Asleep", "Awake"];
const emptyWorkoutItems: ReadonlyArray<WorkoutHistoryItem> = [];

const Table: FC<{ headers: readonly string[]; children: ReactNode }> = ({ headers, children }) => {
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
        <tbody>{children}</tbody>
      </table>
    </div>
  );
};

const FallbackResult: FC<{ value: unknown; className?: string }> = ({ value, className }) => (
  <pre
    className={cn(
      "bg-muted/50 text-foreground/90 mt-1 rounded-md p-2.5 text-xs whitespace-pre-wrap",
      className,
    )}
  >
    {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
  </pre>
);

export const WorkoutHistoryTable: FC<{ items?: ReadonlyArray<WorkoutHistoryItem> }> = ({
  items = emptyWorkoutItems,
}) => {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No workouts found.</p>;
  }

  return (
    <Table headers={workoutHistoryHeaders}>
      {items.map((item) => (
        <tr key={item.session_id} className="border-b border-border/50 last:border-0">
          <td className="py-1.5 pr-3">{formatDate(item.start_time)}</td>
          <td className="py-1.5 pr-3">{item.title ?? "Untitled"}</td>
          <td className="py-1.5 pr-3">
            {item.total_volume_kg !== null ? `${item.total_volume_kg.toFixed(1)} kg` : "—"}
          </td>
          <td className="py-1.5 pr-3">{item.exercise_count}</td>
          <td className="py-1.5 pr-3">{item.set_count}</td>
        </tr>
      ))}
    </Table>
  );
};

export const ExerciseProgressView: FC<{ data: ExerciseProgress }> = ({ data }) => {
  const chartData = useMemo(
    () =>
      data.workouts.map((workout) => ({
        date: formatDate(workout.start_time),
        weight: workout.max_weight_kg,
      })),
    [data.workouts],
  );

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
      {data.workouts.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          No workouts logged in this period.
        </p>
      ) : (
        <>
          <div
            data-testid="exercise-progress-chart"
            className="w-full min-w-0 rounded-md border p-2"
          >
            <ResponsiveContainer width="100%" height={176}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit=" kg" />
                <RechartsTooltip />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Table headers={exerciseProgressHeaders}>
            {data.workouts.map((workout) => (
              <tr key={workout.session_id} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 pr-3">{formatDate(workout.start_time)}</td>
                <td className="py-1.5 pr-3">
                  {workout.max_weight_kg !== null ? `${workout.max_weight_kg.toFixed(1)} kg` : "—"}
                </td>
                <td className="py-1.5 pr-3">
                  {workout.total_volume_kg !== null
                    ? `${workout.total_volume_kg.toFixed(1)} kg`
                    : "—"}
                </td>
                <td className="py-1.5 pr-3">{workout.sets}</td>
                <td className="py-1.5 pr-3">{workout.total_reps ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </div>
  );
};

export const RecoveryCard: FC<{ data: RecoveryResult }> = ({ data }) => {
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

export const SleepTrendView: FC<{ data: SleepTrend }> = ({ data }) => {
  const chartData = useMemo(
    () =>
      data.nights.map((night) => ({
        date: formatDate(night.date),
        asleepHours: night.asleep_min === null ? null : night.asleep_min / 60,
      })),
    [data.nights],
  );
  const hasSleepData = data.nights.some((night) => night.asleep_min !== null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">Sleep trend</span>
        <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          {data.days} nights
        </span>
        {data.avg_sleep_hours !== null && (
          <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            Average: {data.avg_sleep_hours.toFixed(1)} h
          </span>
        )}
      </div>
      {hasSleepData ? (
        <>
          <div data-testid="sleep-trend-chart" className="w-full min-w-0 rounded-md border p-2">
            <ResponsiveContainer width="100%" height={176}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit=" h" />
                <RechartsTooltip />
                <Line
                  type="monotone"
                  dataKey="asleepHours"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Table headers={sleepTrendHeaders}>
            {data.nights.map((night) => (
              <tr key={night.date} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 pr-3">{formatDate(night.date)}</td>
                <td className="py-1.5 pr-3">
                  {night.asleep_min === null ? "—" : formatSleepDuration(night.asleep_min)}
                </td>
                <td className="py-1.5 pr-3">
                  {night.awake_min === null ? "—" : formatSleepDuration(night.awake_min)}
                </td>
              </tr>
            ))}
          </Table>
        </>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          No sleep data in this period.
        </p>
      )}
    </div>
  );
};

export const WorkoutStreakCard: FC<{ data: WorkoutStreak }> = ({ data }) => (
  <div className="grid gap-2 sm:grid-cols-3">
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">Current streak</p>
      <p className="text-lg font-semibold">{data.current_streak} days</p>
    </div>
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">Longest streak</p>
      <p className="text-lg font-semibold">{data.longest_streak} days</p>
    </div>
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">Last workout</p>
      <p className="text-sm">
        {data.last_workout_date === null
          ? "No workouts logged"
          : formatDate(data.last_workout_date)}
      </p>
    </div>
  </div>
);

export const WorkoutHistoryToolRenderer: FC<{ result: unknown; className?: string }> = ({
  result,
  className,
}) => {
  const workoutHistory = Schema.decodeUnknownOption(WorkoutHistory)(result);
  if (Option.isNone(workoutHistory)) return <FallbackResult value={result} className={className} />;
  return <WorkoutHistoryTable items={workoutHistory.value} />;
};

export const ExerciseProgressToolRenderer: FC<{ result: unknown; className?: string }> = ({
  result,
  className,
}) => {
  const exerciseProgress = Schema.decodeUnknownOption(ExerciseProgressSchema)(result);
  if (Option.isNone(exerciseProgress))
    return <FallbackResult value={result} className={className} />;
  return <ExerciseProgressView data={exerciseProgress.value} />;
};

export const RecoveryToolRenderer: FC<{ result: unknown; className?: string }> = ({
  result,
  className,
}) => {
  const recoveryResult = Schema.decodeUnknownOption(RecoveryResultSchema)(result);
  if (Option.isNone(recoveryResult)) return <FallbackResult value={result} className={className} />;
  return <RecoveryCard data={recoveryResult.value} />;
};

export const SleepTrendToolRenderer: FC<{ result: unknown; className?: string }> = ({
  result,
  className,
}) => {
  const sleepTrend = Schema.decodeUnknownOption(SleepTrendSchema)(result);
  if (Option.isNone(sleepTrend)) return <FallbackResult value={result} className={className} />;
  return <SleepTrendView data={sleepTrend.value} />;
};

export const WorkoutStreakToolRenderer: FC<{ result: unknown; className?: string }> = ({
  result,
  className,
}) => {
  const workoutStreak = Schema.decodeUnknownOption(WorkoutStreakSchema)(result);
  if (Option.isNone(workoutStreak)) return <FallbackResult value={result} className={className} />;
  return <WorkoutStreakCard data={workoutStreak.value} />;
};
