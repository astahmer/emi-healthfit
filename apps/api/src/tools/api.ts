import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as Tool from "effect/unstable/ai/Tool";
import * as Toolkit from "effect/unstable/ai/Toolkit";
import type { JSONSchema7 } from "json-schema";
import { buildChatContext } from "../chat/context.ts";
import {
  getDataSummary,
  getExerciseProgress,
  getSleepTrend,
  getWorkoutHistory,
  getWorkoutStreak,
  searchMemories,
  type QueryDatabaseClient,
} from "../db/operations.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema7;
}

export class ToolExecutionError extends Schema.TaggedErrorClass<ToolExecutionError>()(
  "ToolExecutionError",
  {
    tool: Schema.String,
    message: Schema.String,
  },
) {}

const GetSummary = Tool.make("get_summary", {
  description: "Returns a summary of imported health and workout data.",
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const GetRecovery = Tool.make("get_recovery", {
  description: "Returns today's recovery score and supporting stats.",
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const QueryDatabase = Tool.make("query_database", {
  description: "Run a read-only SQL SELECT query against the gym data D1 database.",
  parameters: Schema.Struct({
    query: Schema.String.annotate({ description: "A single read-only SELECT query." }),
  }),
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const GetWorkoutHistory = Tool.make("get_workout_history", {
  description:
    "List recent strength workouts with date, title, volume, exercise count, and set count.",
  parameters: Schema.Struct({
    limit: Schema.optional(
      Schema.Int.annotate({
        description: "Maximum number of workouts to return (default 10).",
      }),
    ),
  }),
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const GetExerciseProgress = Tool.make("get_exercise_progress", {
  description:
    "Get weight, rep, and volume trend plus the current PR for a specific exercise over recent weeks.",
  parameters: Schema.Struct({
    exercise_title: Schema.String.annotate({
      description: "Exact exercise name as it appears in Hevy.",
    }),
    weeks: Schema.optional(
      Schema.Int.annotate({
        description: "Number of weeks to look back (default 8).",
      }),
    ),
  }),
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const GetSleepTrend = Tool.make("get_sleep_trend", {
  description: "Get average sleep duration over the last N days.",
  parameters: Schema.Struct({
    days: Schema.optional(
      Schema.Int.annotate({
        description: "Number of days to average (default 7).",
      }),
    ),
  }),
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const GetWorkoutStreak = Tool.make("get_workout_streak", {
  description: "Get current and longest consecutive workout streaks from Hevy sessions.",
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const SearchMemories = Tool.make("search_memories", {
  description:
    "Search saved memory snippets from past sessions when the user references earlier context.",
  parameters: Schema.Struct({
    query: Schema.String.annotate({ description: "Search terms to match against memories." }),
    limit: Schema.optional(
      Schema.Int.annotate({
        description: "Maximum number of memories to return (default 10).",
      }),
    ),
  }),
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const RenderComponent = Tool.make("render_component", {
  description:
    "Render a rich UI component for workout tables, progress, recovery, metrics, or sets.",
  parameters: Schema.Struct({
    component: Schema.String.annotate({
      description: "WorkoutTable, ExerciseProgress, RecoveryCard, MetricCard, or SetList.",
    }),
    props: Schema.Record(Schema.String, Schema.Unknown).annotate({
      description: "Props for the selected component.",
    }),
  }),
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

export const FitnessToolkit = Toolkit.make(
  GetSummary,
  GetRecovery,
  QueryDatabase,
  GetWorkoutHistory,
  GetExerciseProgress,
  GetSleepTrend,
  GetWorkoutStreak,
  SearchMemories,
  RenderComponent,
);

const toolError = ({ tool, message }: { tool: string; message: string }) =>
  new ToolExecutionError({ tool, message });

const makeHandlers = Effect.fn("FitnessToolkit.makeHandlers")(function* (db: QueryDatabaseClient) {
  const services = yield* Effect.context<RuntimeContext>();
  const provideServices = <A, E>(effect: Effect.Effect<A, E, RuntimeContext>) =>
    Effect.provideContext(effect, services);

  return FitnessToolkit.of({
    get_summary: Effect.fn("FitnessToolkit.getSummary")(() => provideServices(getDataSummary(db))),
    get_recovery: Effect.fn("FitnessToolkit.getRecovery")(() =>
      provideServices(buildChatContext(db)).pipe(
        Effect.map((context) => ({
          today: context.today,
          label: context.recoveryLabel,
          explanation: context.recoveryExplanation,
          lastWorkout: context.lastWorkout.lastSessionSummary,
          sleepAverageHours:
            context.sleep.sevenDayAverage === null ? null : context.sleep.sevenDayAverage / 60,
          recentWorkoutCount: context.recentWorkoutCount,
          recentVolume: context.lastWorkout.recentVolume,
        })),
      ),
    ),
    query_database: Effect.fn("FitnessToolkit.queryDatabase")(function* ({ query }) {
      const normalized = query.trim();
      if (!/^select\b/i.test(normalized) || normalized.includes(";")) {
        return yield* Effect.fail(
          toolError({ tool: "query_database", message: "Only one SELECT query is allowed." }),
        );
      }
      const result = yield* provideServices(db.prepare(normalized).all<unknown>());
      return result.results;
    }),
    get_workout_history: Effect.fn("FitnessToolkit.getWorkoutHistory")(({ limit }) =>
      provideServices(getWorkoutHistory(db, limit ?? 10)),
    ),
    get_exercise_progress: Effect.fn("FitnessToolkit.getExerciseProgress")(
      ({ exercise_title, weeks }) =>
        provideServices(getExerciseProgress(db, exercise_title, weeks ?? 8)),
    ),
    get_sleep_trend: Effect.fn("FitnessToolkit.getSleepTrend")(({ days }) =>
      provideServices(getSleepTrend(db, days ?? 7)),
    ),
    get_workout_streak: Effect.fn("FitnessToolkit.getWorkoutStreak")(() =>
      provideServices(getWorkoutStreak(db)),
    ),
    search_memories: Effect.fn("FitnessToolkit.searchMemories")(({ query, limit }) =>
      provideServices(searchMemories(db, query, limit ?? 10)).pipe(
        Effect.map((results) => ({ results })),
      ),
    ),
    render_component: Effect.fn("FitnessToolkit.renderComponent")(({ component, props }) =>
      Effect.succeed({
        spec: {
          root: "root",
          elements: {
            root: { type: component, props },
          },
        },
      }),
    ),
  });
});

export const tools: ToolDefinition[] = Object.values(FitnessToolkit.tools).map((tool) => ({
  name: tool.name,
  description: Tool.getDescription(tool) ?? "",
  parameters: Tool.getJsonSchema(tool) as JSONSchema7,
}));

export const executeTool = Effect.fn("FitnessToolkit.execute")(function* ({
  db,
  name,
  args,
}: {
  db: QueryDatabaseClient;
  name: string;
  args: Record<string, unknown>;
}) {
  if (!(name in FitnessToolkit.tools)) {
    return yield* Effect.fail(toolError({ tool: name, message: "Unknown tool." }));
  }

  const runtime = yield* FitnessToolkit.pipe(
    Effect.provide(FitnessToolkit.toLayer(makeHandlers(db))),
  );
  const result = yield* runtime
    .handle(name as keyof typeof FitnessToolkit.tools, args as never)
    .pipe(Stream.unwrap, Stream.run(Sink.last()), Effect.flatMap(Effect.fromOption));
  return result.encodedResult;
});
import { RuntimeContext } from "alchemy";
