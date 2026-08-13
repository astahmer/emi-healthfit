"use client";

import { Suspense, lazy, useMemo, type FC, type ReactNode } from "react";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { cn } from "../lib/cn.ts";

const rechartsPromise = import("recharts");

const ChartFallback = () => (
  <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
    Loading chart…
  </div>
);

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
  readonly estimated_1rm_kg?: number | null;
}

interface ExerciseProgress {
  readonly exercise_title: string;
  readonly weeks: number;
  readonly workouts: ReadonlyArray<ExerciseProgressSet>;
  readonly personalRecord: {
    readonly weight_kg: number | null;
    readonly reps: number | null;
    readonly volume_kg: number | null;
    readonly estimated_1rm_kg?: number | null;
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

interface TrainingLoad {
  readonly weeks: ReadonlyArray<{
    readonly week_start: string;
    readonly workouts: number;
    readonly sets: number;
    readonly volume_kg: number;
    readonly duration_sec: number;
  }>;
  readonly total_volume_kg: number;
  readonly current_week_volume_kg: number;
  readonly previous_week_volume_kg: number | null;
  readonly volume_change_pct: number | null;
}

interface RecoveryTimeline {
  readonly days: ReadonlyArray<{
    readonly date: string;
    readonly asleep_min: number | null;
    readonly workouts: number;
    readonly volume_kg: number;
  }>;
  readonly average_sleep_hours: number | null;
}

interface GoalProgress {
  readonly period_days: number;
  readonly average_steps: number | null;
  readonly step_goal: number | null;
  readonly workouts: number;
  readonly workouts_goal: number | null;
  readonly latest_weight_kg: number | null;
  readonly latest_weight_date: string | null;
  readonly target_weight_kg: number | null;
  readonly weight_remaining_kg: number | null;
}

interface NextWorkout {
  readonly suggested_title: string;
  readonly readiness: "ready" | "recover" | "unknown";
  readonly reason: string;
  readonly last_workout_date: string | null;
  readonly last_workout_title: string | null;
  readonly days_since_last_workout: number | null;
  readonly recent_workout_count: number;
  readonly sleep_average_hours: number | null;
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
      estimated_1rm_kg: Schema.optional(Schema.NullOr(Schema.Number)),
    }),
  ),
  personalRecord: Schema.Struct({
    weight_kg: Schema.NullOr(Schema.Number),
    reps: Schema.NullOr(Schema.Number),
    volume_kg: Schema.NullOr(Schema.Number),
    estimated_1rm_kg: Schema.optional(Schema.NullOr(Schema.Number)),
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
const TrainingLoadSchema = Schema.Struct({
  weeks: Schema.Array(
    Schema.Struct({
      week_start: Schema.String,
      workouts: Schema.Number,
      sets: Schema.Number,
      volume_kg: Schema.Number,
      duration_sec: Schema.Number,
    }),
  ),
  total_volume_kg: Schema.Number,
  current_week_volume_kg: Schema.Number,
  previous_week_volume_kg: Schema.NullOr(Schema.Number),
  volume_change_pct: Schema.NullOr(Schema.Number),
});
const RecoveryTimelineSchema = Schema.Struct({
  days: Schema.Array(
    Schema.Struct({
      date: Schema.String,
      asleep_min: Schema.NullOr(Schema.Number),
      workouts: Schema.Number,
      volume_kg: Schema.Number,
    }),
  ),
  average_sleep_hours: Schema.NullOr(Schema.Number),
});
const GoalProgressSchema = Schema.Struct({
  period_days: Schema.Number,
  average_steps: Schema.NullOr(Schema.Number),
  step_goal: Schema.NullOr(Schema.Number),
  workouts: Schema.Number,
  workouts_goal: Schema.NullOr(Schema.Number),
  latest_weight_kg: Schema.NullOr(Schema.Number),
  latest_weight_date: Schema.NullOr(Schema.String),
  target_weight_kg: Schema.NullOr(Schema.Number),
  weight_remaining_kg: Schema.NullOr(Schema.Number),
});
const NextWorkoutSchema = Schema.Struct({
  suggested_title: Schema.String,
  readiness: Schema.Literals(["ready", "recover", "unknown"]),
  reason: Schema.String,
  last_workout_date: Schema.NullOr(Schema.String),
  last_workout_title: Schema.NullOr(Schema.String),
  days_since_last_workout: Schema.NullOr(Schema.Number),
  recent_workout_count: Schema.Number,
  sleep_average_hours: Schema.NullOr(Schema.Number),
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

type ExerciseProgressChartData = ReadonlyArray<{
  readonly date: string;
  readonly weight: number | null;
  readonly estimatedOneRepMax: number | null | undefined;
}>;

const ExerciseProgressChart = lazy(async () => {
  const {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip: RechartsTooltip,
    XAxis,
    YAxis,
  } = await rechartsPromise;

  const Chart: FC<{ data: ExerciseProgressChartData }> = ({ data }) => (
    <div data-testid="exercise-progress-chart" className="w-full min-w-0 rounded-md border p-2">
      <ResponsiveContainer width="100%" height={176}>
        <LineChart data={data}>
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
          <Line
            type="monotone"
            dataKey="estimatedOneRepMax"
            name="Estimated 1RM"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  return { default: Chart };
});

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

const ExerciseProgressViewContent: FC<{ data: ExerciseProgress }> = ({ data }) => {
  const chartData = useMemo(
    () =>
      data.workouts.map((workout) => ({
        date: formatDate(workout.start_time),
        weight: workout.max_weight_kg,
        estimatedOneRepMax: workout.estimated_1rm_kg,
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
        {data.personalRecord.estimated_1rm_kg !== undefined &&
          data.personalRecord.estimated_1rm_kg !== null && (
            <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              Est. 1RM: {data.personalRecord.estimated_1rm_kg.toFixed(1)} kg
            </span>
          )}
      </div>
      {data.workouts.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          No workouts logged in this period.
        </p>
      ) : (
        <>
          <Suspense fallback={<ChartFallback />}>
            <ExerciseProgressChart data={chartData} />
          </Suspense>
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

export const ExerciseProgressView: FC<{ data: ExerciseProgress }> = ({ data }) => (
  <Suspense fallback={<ChartFallback />}>
    <ExerciseProgressViewContent data={data} />
  </Suspense>
);

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

const SleepTrendViewContent: FC<{ data: SleepTrend }> = ({ data }) => {
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
          <Suspense fallback={<ChartFallback />}>
            <SleepTrendChart data={chartData} />
          </Suspense>
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

export const SleepTrendView: FC<{ data: SleepTrend }> = ({ data }) => (
  <Suspense fallback={<ChartFallback />}>
    <SleepTrendViewContent data={data} />
  </Suspense>
);

type SleepTrendChartData = ReadonlyArray<{
  readonly date: string;
  readonly asleepHours: number | null;
}>;

const SleepTrendChart = lazy(async () => {
  const {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip: RechartsTooltip,
    XAxis,
    YAxis,
  } = await rechartsPromise;

  const Chart: FC<{ data: SleepTrendChartData }> = ({ data }) => (
    <div data-testid="sleep-trend-chart" className="w-full min-w-0 rounded-md border p-2">
      <ResponsiveContainer width="100%" height={176}>
        <LineChart data={data}>
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
  );

  return { default: Chart };
});

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

const TrainingLoadViewContent: FC<{ data: TrainingLoad }> = ({ data }) => {
  const chartData = useMemo(
    () =>
      data.weeks.map((week) => ({
        week: formatDate(week.week_start),
        volume: week.volume_kg,
        workouts: week.workouts,
      })),
    [data.weeks],
  );

  if (data.weeks.length === 0) {
    return <p className="text-sm text-muted-foreground">No training load in this period.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">Training load</span>
        <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          {data.total_volume_kg.toFixed(0)} kg total
        </span>
        {data.volume_change_pct !== null && (
          <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            {data.volume_change_pct >= 0 ? "+" : ""}
            {data.volume_change_pct.toFixed(1)}% vs prior week
          </span>
        )}
      </div>
      <Suspense fallback={<ChartFallback />}>
        <TrainingLoadChart data={chartData} />
      </Suspense>
    </div>
  );
};

export const TrainingLoadView: FC<{ data: TrainingLoad }> = ({ data }) => (
  <Suspense fallback={<ChartFallback />}>
    <TrainingLoadViewContent data={data} />
  </Suspense>
);

type TrainingLoadChartData = ReadonlyArray<{
  readonly week: string;
  readonly volume: number;
  readonly workouts: number;
}>;

const TrainingLoadChart = lazy(async () => {
  const {
    Bar,
    BarChart,
    CartesianGrid,
    Tooltip: RechartsTooltip,
    ResponsiveContainer,
    XAxis,
    YAxis,
  } = await rechartsPromise;

  const Chart: FC<{ data: TrainingLoadChartData }> = ({ data }) => (
    <div data-testid="training-load-chart" className="w-full min-w-0 rounded-md border p-2">
      <ResponsiveContainer width="100%" height={176}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} unit=" kg" />
          <RechartsTooltip />
          <Bar dataKey="volume" fill="var(--primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return { default: Chart };
});

const RecoveryTimelineViewContent: FC<{ data: RecoveryTimeline }> = ({ data }) => {
  const chartData = useMemo(
    () =>
      data.days.map((day) => ({
        date: formatDate(day.date),
        asleepHours: day.asleep_min === null ? null : day.asleep_min / 60,
        workouts: day.workouts,
      })),
    [data.days],
  );
  const hasData = data.days.some((day) => day.asleep_min !== null || day.workouts > 0);

  if (!hasData) {
    return (
      <p className="text-sm text-muted-foreground">No recovery timeline data in this period.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">Recovery timeline</span>
        {data.average_sleep_hours !== null && (
          <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            Sleep avg: {data.average_sleep_hours.toFixed(1)} h
          </span>
        )}
      </div>
      <Suspense fallback={<ChartFallback />}>
        <RecoveryTimelineChart data={chartData} />
      </Suspense>
    </div>
  );
};

export const RecoveryTimelineView: FC<{ data: RecoveryTimeline }> = ({ data }) => (
  <Suspense fallback={<ChartFallback />}>
    <RecoveryTimelineViewContent data={data} />
  </Suspense>
);

type RecoveryTimelineChartData = ReadonlyArray<{
  readonly date: string;
  readonly asleepHours: number | null;
  readonly workouts: number;
}>;

const RecoveryTimelineChart = lazy(async () => {
  const {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip: RechartsTooltip,
    XAxis,
    YAxis,
  } = await rechartsPromise;

  const Chart: FC<{ data: RecoveryTimelineChartData }> = ({ data }) => (
    <div data-testid="recovery-timeline-chart" className="w-full min-w-0 rounded-md border p-2">
      <ResponsiveContainer width="100%" height={176}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis yAxisId="sleep" tick={{ fontSize: 10 }} unit=" h" />
          <YAxis yAxisId="workouts" orientation="right" tick={{ fontSize: 10 }} />
          <RechartsTooltip />
          <Line
            yAxisId="sleep"
            type="monotone"
            dataKey="asleepHours"
            name="Sleep"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
          />
          <Line
            yAxisId="workouts"
            type="step"
            dataKey="workouts"
            name="Workouts"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={{ r: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  return { default: Chart };
});

export const GoalProgressCard: FC<{ data: GoalProgress }> = ({ data }) => {
  const stepProgress =
    data.average_steps === null || data.step_goal === null
      ? null
      : Math.round((data.average_steps / data.step_goal) * 100);
  const workoutProgress =
    data.workouts_goal === null ? null : Math.round((data.workouts / data.workouts_goal) * 100);

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-lg border p-3">
        <p className="text-muted-foreground text-xs">Steps ({data.period_days}d avg)</p>
        <p className="text-lg font-semibold">
          {data.average_steps === null
            ? "No data"
            : Math.round(data.average_steps).toLocaleString()}
        </p>
        <p className="text-xs text-muted-foreground">
          {data.step_goal === null
            ? "No target set"
            : `${stepProgress}% of ${data.step_goal.toLocaleString()}`}
        </p>
      </div>
      <div className="rounded-lg border p-3">
        <p className="text-muted-foreground text-xs">Strength workouts</p>
        <p className="text-lg font-semibold">{data.workouts}</p>
        <p className="text-xs text-muted-foreground">
          {data.workouts_goal === null
            ? "No target set"
            : `${workoutProgress}% of ${data.workouts_goal}`}
        </p>
      </div>
      <div className="rounded-lg border p-3">
        <p className="text-muted-foreground text-xs">Body weight</p>
        <p className="text-lg font-semibold">
          {data.latest_weight_kg === null ? "No data" : `${data.latest_weight_kg.toFixed(1)} kg`}
        </p>
        {data.latest_weight_date !== null && (
          <p className="text-xs text-muted-foreground">Recorded {data.latest_weight_date}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {data.target_weight_kg === null
            ? "No target set"
            : `${data.weight_remaining_kg?.toFixed(1) ?? "—"} kg to target`}
        </p>
      </div>
    </div>
  );
};

export const NextWorkoutCard: FC<{ data: NextWorkout }> = ({ data }) => (
  <div className="flex flex-col gap-3 rounded-lg border p-3">
    <div className="flex flex-wrap items-baseline gap-2">
      <p className="text-muted-foreground text-xs">Suggested next workout</p>
      <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">{data.readiness}</span>
    </div>
    <p className="text-lg font-semibold">{data.suggested_title}</p>
    <p className="text-sm text-muted-foreground">{data.reason}</p>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>Recent workouts: {data.recent_workout_count}</span>
      {data.last_workout_date !== null && <span>Last: {formatDate(data.last_workout_date)}</span>}
      {data.sleep_average_hours !== null && (
        <span>Sleep avg: {data.sleep_average_hours.toFixed(1)} h</span>
      )}
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

export const TrainingLoadToolRenderer: FC<{ result: unknown; className?: string }> = ({
  result,
  className,
}) => {
  const trainingLoad = Schema.decodeUnknownOption(TrainingLoadSchema)(result);
  if (Option.isNone(trainingLoad)) return <FallbackResult value={result} className={className} />;
  return <TrainingLoadView data={trainingLoad.value} />;
};

export const RecoveryTimelineToolRenderer: FC<{ result: unknown; className?: string }> = ({
  result,
  className,
}) => {
  const recoveryTimeline = Schema.decodeUnknownOption(RecoveryTimelineSchema)(result);
  if (Option.isNone(recoveryTimeline))
    return <FallbackResult value={result} className={className} />;
  return <RecoveryTimelineView data={recoveryTimeline.value} />;
};

export const GoalProgressToolRenderer: FC<{ result: unknown; className?: string }> = ({
  result,
  className,
}) => {
  const goalProgress = Schema.decodeUnknownOption(GoalProgressSchema)(result);
  if (Option.isNone(goalProgress)) return <FallbackResult value={result} className={className} />;
  return <GoalProgressCard data={goalProgress.value} />;
};

export const NextWorkoutToolRenderer: FC<{ result: unknown; className?: string }> = ({
  result,
  className,
}) => {
  const nextWorkout = Schema.decodeUnknownOption(NextWorkoutSchema)(result);
  if (Option.isNone(nextWorkout)) return <FallbackResult value={result} className={className} />;
  return <NextWorkoutCard data={nextWorkout.value} />;
};
