"use client";

import { memo, useMemo, type FC, type ReactNode } from "react";
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
import { useToolRenderer } from "@emi/core-web";
import { cn } from "@/lib/utils";
import { GenUIRenderer } from "./gen-ui/registry";
import { ErrorBoundary } from "../error-boundary";

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

interface Citation {
  readonly title?: string;
  readonly url?: string;
  readonly content?: string;
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
const Citations = Schema.Array(
  Schema.Struct({
    title: Schema.optional(Schema.String),
    url: Schema.optional(Schema.String),
    content: Schema.optional(Schema.String),
  }),
);
const CitationContainer = Schema.Struct({
  results: Schema.optional(Citations),
  sources: Schema.optional(Citations),
  citations: Schema.optional(Citations),
});
const ErrorText = Schema.Struct({
  type: Schema.Literal("error-text"),
  value: Schema.optional(Schema.Unknown),
});
const RenderComponentResult = Schema.Struct({ spec: Schema.Unknown });
const JsonResult = Schema.fromJsonString(Schema.Unknown);

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

const parseResult = (result: unknown): unknown =>
  Option.getOrElse(Schema.decodeUnknownOption(JsonResult)(result), () => result);

const getCitations = (value: unknown): ReadonlyArray<Citation> | undefined => {
  const container = Schema.decodeUnknownOption(CitationContainer)(value);
  if (Option.isNone(container)) return undefined;
  return container.value.results ?? container.value.sources ?? container.value.citations;
};

const workoutHistoryHeaders = ["Date", "Workout", "Volume", "Exercises", "Sets"];
const exerciseProgressHeaders = ["Date", "Max weight", "Volume", "Sets", "Reps"];
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
          <div className="h-48 w-full rounded-md border p-2">
            <ResponsiveContainer width="100%" height="100%">
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

const WebSearchCitations: FC<{ citations: ReadonlyArray<Citation> }> = ({ citations }) => {
  return (
    <div className="flex flex-col gap-2">
      {citations.map((citation) => (
        <div
          key={citation.url ?? citation.title ?? citation.content ?? "citation"}
          className="rounded-lg border p-3"
        >
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

export interface ToolResultContentProps {
  toolName: string;
  result?: unknown;
  className?: string;
}

const ToolResultContentImpl: FC<ToolResultContentProps> = ({ toolName, result, className }) => {
  const registeredRenderer = useToolRenderer(toolName);
  const parsed = parseResult(result);
  const errorText = Schema.decodeUnknownOption(ErrorText)(parsed);
  if (Option.isSome(errorText)) {
    return (
      <p className={cn("text-sm text-destructive", className)}>
        {String(errorText.value.value ?? "Tool failed")}
      </p>
    );
  }

  if (registeredRenderer !== undefined) {
    const RegisteredRenderer = registeredRenderer;
    return <RegisteredRenderer result={parsed} className={className} />;
  }

  const citations = getCitations(parsed);
  if ((toolName === "web_search" || toolName === "web-search") && citations !== undefined) {
    return <WebSearchCitations citations={citations} />;
  }

  const renderComponent = Schema.decodeUnknownOption(RenderComponentResult)(parsed);
  if (toolName === "render_component" && Option.isSome(renderComponent)) {
    const spec = renderComponent.value.spec;
    return (
      <ErrorBoundary fallback={<FallbackResult value={parsed} className={className} />}>
        <GenUIRenderer spec={spec} />
      </ErrorBoundary>
    );
  }

  return <FallbackResult value={parsed} className={className} />;
};

export const ToolResultContent = memo(ToolResultContentImpl);
ToolResultContent.displayName = "ToolResultContent";
