import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as Tool from "effect/unstable/ai/Tool";
import * as Toolkit from "effect/unstable/ai/Toolkit";
import type { JSONSchema7 } from "json-schema";
import { ServerDatabase } from "@emi/core/server/database";
import { buildChatContext } from "../chat/context.ts";
import {
  getDataSummary,
  getExerciseProgress,
  getGoalProgress,
  getNextWorkout,
  getRecoveryTimeline,
  getSleepTrend,
  getTrainingLoad,
  getWorkoutHistory,
  getWorkoutDetails,
  getWorkoutStreak,
} from "../db/fitness.ts";
import type { HealthfitDatabaseSchema } from "../db/schema.ts";

interface ToolsDatabaseSchema
  extends
    ServerDatabase.ConversationDatabaseSchema,
    ServerDatabase.MemoryDatabaseSchema,
    HealthfitDatabaseSchema {}

export type HealthfitToolsDatabaseSchema = ToolsDatabaseSchema;

type ToolsDb = ServerDatabase.QueryDatabaseClient<ToolsDatabaseSchema>;

/**
 * Kysely's `Transaction`/`withRecursive` typings make `Kysely<T>` (and thus
 * `QueryDatabaseClient<T>`) structurally invariant in `T`: a client typed for
 * a wider composed schema can't be passed where a narrower schema is
 * expected, even though the wider schema is a strict superset. This is a
 * pre-existing Kysely limitation (reproduces with the project's own
 * `DatabaseSchema`/`ConversationDatabaseSchema` pair), not specific to this
 * toolkit, so we narrow explicitly at each call boundary instead of widening
 * every downstream function's schema parameter.
 */
const narrow = <TSchema>(db: ToolsDb): ServerDatabase.QueryDatabaseClient<TSchema> =>
  db as unknown as ServerDatabase.QueryDatabaseClient<TSchema>;

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema7;
}

class ToolExecutionError extends Schema.TaggedErrorClass<ToolExecutionError>()(
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

const GetWorkoutDetails = Tool.make("get_workout_details", {
  description:
    "Get one owned workout by stable session id, including exercises, sets, reps, weights, RPE, and calculated volume.",
  parameters: Schema.Struct({
    sessionId: Schema.String.annotate({
      description: "Stable session_id returned by get_workout_history.",
    }),
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
  description: "Get nightly sleep duration and averages over the last N days.",
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

const GetTrainingLoad = Tool.make("get_training_load", {
  description: "Get weekly strength-training volume, workouts, sets, and week-over-week change.",
  parameters: Schema.Struct({
    weeks: Schema.optional(
      Schema.Int.annotate({ description: "Number of weeks to look back (default 4)." }),
    ),
  }),
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const GetRecoveryTimeline = Tool.make("get_recovery_timeline", {
  description: "Get a daily timeline of sleep and strength-training load for recovery context.",
  parameters: Schema.Struct({
    days: Schema.optional(
      Schema.Int.annotate({ description: "Number of days to look back (default 14)." }),
    ),
  }),
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const GetGoalProgress = Tool.make("get_goal_progress", {
  description:
    "Get progress for supplied step, workout-frequency, and body-weight goals. Search memories first when a goal is not in the current chat.",
  parameters: Schema.Struct({
    days: Schema.optional(
      Schema.Int.annotate({ description: "Evaluation window in days (default 7)." }),
    ),
    step_goal: Schema.optional(
      Schema.Number.annotate({ description: "Daily step target, when known." }),
    ),
    workouts_goal: Schema.optional(
      Schema.Int.annotate({
        description: "Strength-workout target for the evaluation window, when known.",
      }),
    ),
    target_weight_kg: Schema.optional(
      Schema.Number.annotate({ description: "Body-weight target in kg, when known." }),
    ),
  }),
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const GetNextWorkout = Tool.make("get_next_workout", {
  description:
    "Suggest the next strength-workout focus from the latest logged session and seven-day sleep context.",
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const SearchMemories = Tool.make("search_memories", {
  description:
    "Search permanent user memories. Call this when a question may depend on earlier chats, preferences, goals, or constraints and the supplied memory context is absent or uncertain. Never guess a past detail instead of searching.",
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

const GetThreads = Tool.dynamic("get_threads", {
  description: "List the side threads in the current conversation.",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const ReadThread = Tool.make("read_thread", {
  description: "Read the complete message chain for a side thread in this conversation.",
  parameters: Schema.Struct({ thread_id: Schema.String }),
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const ReadMessage = Tool.make("read_message", {
  description: "Read one message in the current conversation by id.",
  parameters: Schema.Struct({ message_id: Schema.String }),
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const CreateThread = Tool.make("create_thread", {
  description: "Create a side thread anchored at a message in the current conversation.",
  parameters: Schema.Struct({
    anchor_message_id: Schema.String,
    title: Schema.optional(Schema.String),
  }),
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const SummarizeThread = Tool.make("summarize_thread", {
  description: "Summarize a side thread and store the summary as a message.",
  parameters: Schema.Struct({ thread_id: Schema.String }),
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const SummarizeToMessage = Tool.make("summarize_to_message", {
  description: "Summarize a side thread into a referenceable message at an optional target.",
  parameters: Schema.Struct({
    thread_id: Schema.String,
    target_message_id: Schema.optional(Schema.String),
  }),
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const RenderComponent = Tool.make("render_component", {
  description:
    "Render a rich UI component. Props: WorkoutTable {workouts}; ExerciseProgress {exercise_title, weeks, workouts, personalRecord}; SleepTrend {days, avg_sleep_hours?, nights}; WorkoutStreak {current_streak, longest_streak, last_workout_date?}; TrainingLoad {weeks, total_volume_kg, current_week_volume_kg, previous_week_volume_kg?, volume_change_pct?}; RecoveryTimeline {days, average_sleep_hours?}; GoalProgress {period_days, average_steps?, step_goal?, workouts, workouts_goal?, latest_weight_kg?, target_weight_kg?, weight_remaining_kg?}; NextWorkout {suggested_title, readiness, reason, last_workout_date?, last_workout_title?, days_since_last_workout?, recent_workout_count, sleep_average_hours?}; RecoveryCard {today?, label?, explanation?, lastWorkout?, sleepAverageHours?, recentWorkoutCount?, recentVolume?}; MetricCard {label, value, unit?, trend?: up|down|flat}; SetList {sets}. Never put title, subtitle, or context props on MetricCard.",
  parameters: Schema.Struct({
    component: Schema.String.annotate({
      description:
        "WorkoutTable, ExerciseProgress, SleepTrend, WorkoutStreak, TrainingLoad, RecoveryTimeline, GoalProgress, NextWorkout, RecoveryCard, MetricCard, or SetList.",
    }),
    props: Schema.Record(Schema.String, Schema.Unknown).annotate({
      description: "Props for the selected component.",
    }),
  }),
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

const MetricCardProps = Schema.Struct({
  label: Schema.String,
  value: Schema.Union([Schema.String, Schema.Number]),
  unit: Schema.optional(Schema.String),
  trend: Schema.optional(Schema.Literals(["up", "down", "flat"])),
});

const componentSchemas = new Map<string, Schema.ConstraintDecoder<unknown>>([
  [
    "WorkoutTable",
    Schema.Struct({
      workouts: Schema.Array(
        Schema.Struct({
          session_id: Schema.String,
          title: Schema.NullOr(Schema.String),
          start_time: Schema.String,
          total_volume_kg: Schema.NullOr(Schema.Number),
          exercise_count: Schema.Number,
          set_count: Schema.Number,
        }),
      ),
    }),
  ],
  [
    "ExerciseProgress",
    Schema.Struct({
      exercise_title: Schema.String,
      weeks: Schema.Number,
      workouts: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
      personalRecord: Schema.Record(Schema.String, Schema.Unknown),
    }),
  ],
  [
    "RecoveryCard",
    Schema.Struct({
      today: Schema.optional(Schema.String),
      label: Schema.optional(Schema.String),
      explanation: Schema.optional(Schema.String),
      lastWorkout: Schema.optional(Schema.NullOr(Schema.String)),
      sleepAverageHours: Schema.optional(Schema.NullOr(Schema.Number)),
      recentWorkoutCount: Schema.optional(Schema.Number),
      recentVolume: Schema.optional(Schema.NullOr(Schema.Number)),
    }),
  ],
  ["MetricCard", MetricCardProps],
  [
    "SleepTrend",
    Schema.Struct({
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
    }),
  ],
  [
    "WorkoutStreak",
    Schema.Struct({
      current_streak: Schema.Number,
      longest_streak: Schema.Number,
      last_workout_date: Schema.NullOr(Schema.String),
    }),
  ],
  [
    "TrainingLoad",
    Schema.Struct({
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
    }),
  ],
  [
    "RecoveryTimeline",
    Schema.Struct({
      days: Schema.Array(
        Schema.Struct({
          date: Schema.String,
          asleep_min: Schema.NullOr(Schema.Number),
          workouts: Schema.Number,
          volume_kg: Schema.Number,
        }),
      ),
      average_sleep_hours: Schema.NullOr(Schema.Number),
    }),
  ],
  [
    "GoalProgress",
    Schema.Struct({
      period_days: Schema.Number,
      average_steps: Schema.NullOr(Schema.Number),
      step_goal: Schema.NullOr(Schema.Number),
      workouts: Schema.Number,
      workouts_goal: Schema.NullOr(Schema.Number),
      latest_weight_kg: Schema.NullOr(Schema.Number),
      target_weight_kg: Schema.NullOr(Schema.Number),
      weight_remaining_kg: Schema.NullOr(Schema.Number),
    }),
  ],
  [
    "NextWorkout",
    Schema.Struct({
      suggested_title: Schema.String,
      readiness: Schema.Literals(["ready", "recover", "unknown"]),
      reason: Schema.String,
      last_workout_date: Schema.NullOr(Schema.String),
      last_workout_title: Schema.NullOr(Schema.String),
      days_since_last_workout: Schema.NullOr(Schema.Number),
      recent_workout_count: Schema.Number,
      sleep_average_hours: Schema.NullOr(Schema.Number),
    }),
  ],
  [
    "SetList",
    Schema.Struct({
      sets: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          exercise: Schema.String,
          weightKg: Schema.NullOr(Schema.Number),
          reps: Schema.NullOr(Schema.Number),
          rpe: Schema.optional(Schema.NullOr(Schema.Number)),
          setType: Schema.optional(Schema.NullOr(Schema.String)),
        }),
      ),
    }),
  ],
]);

const FitnessToolkit = Toolkit.make(
  GetSummary,
  GetRecovery,
  GetWorkoutHistory,
  GetWorkoutDetails,
  GetExerciseProgress,
  GetSleepTrend,
  GetWorkoutStreak,
  GetTrainingLoad,
  GetRecoveryTimeline,
  GetGoalProgress,
  GetNextWorkout,
  SearchMemories,
  GetThreads,
  ReadThread,
  ReadMessage,
  CreateThread,
  SummarizeThread,
  SummarizeToMessage,
  RenderComponent,
);

const toolError = ({ tool, message }: { tool: string; message: string }) =>
  new ToolExecutionError({ tool, message });

type ThreadToolOptions = {
  conversationId?: string;
  summarize?: (messages: Array<{ role: string; text: string }>) => Effect.Effect<string, Error>;
};

const StoredParts = Schema.fromJsonString(Schema.Array(Schema.Unknown));

const makeHandlers = Effect.fn("FitnessToolkit.makeHandlers")(function* ({
  db,
  userId,
  threadTools,
}: {
  db: ToolsDb;
  userId: string;
  threadTools: ThreadToolOptions;
}) {
  const conversationDatabase = yield* ServerDatabase.conversations;
  const memoryDatabase = yield* ServerDatabase.memories;
  const requireConversationId = Effect.fn("FitnessToolkit.requireConversationId")(function* ({
    tool,
  }: {
    tool: string;
  }) {
    if (threadTools.conversationId === undefined) {
      return yield* toolError({ tool, message: "A persisted conversation is required." });
    }
    return threadTools.conversationId;
  });
  const requireThread = Effect.fn("FitnessToolkit.requireThread")(function* ({
    tool,
    threadId,
  }: {
    tool: string;
    threadId: string;
  }) {
    const conversationId = yield* requireConversationId({ tool });
    const thread = yield* conversationDatabase.getThread({ userId, threadId });
    if (thread === null || thread.conversation_id !== conversationId) {
      return yield* toolError({ tool, message: "Thread not found." });
    }
    return thread;
  });
  const summarize = Effect.fn("FitnessToolkit.summarizeThread")(function* ({
    threadId,
    targetMessageId,
    tool,
  }: {
    threadId: string;
    targetMessageId?: string;
    tool: string;
  }) {
    yield* requireThread({ tool, threadId });
    if (threadTools.summarize === undefined) {
      return yield* toolError({ tool, message: "Summarization is unavailable." });
    }
    const rows = yield* conversationDatabase.getThreadMessages({ userId, threadId });
    const messages = rows.map((row) => ({
      role: row.role,
      text: Schema.decodeUnknownSync(StoredParts)(row.parts)
        .filter(
          (part): part is { type: string; text: string } =>
            typeof part === "object" &&
            part !== null &&
            "type" in part &&
            part.type === "text" &&
            "text" in part &&
            typeof part.text === "string",
        )
        .map((part) => part.text)
        .join("\n"),
    }));
    const summary = yield* threadTools.summarize(messages);
    const messageId = yield* conversationDatabase.summarizeThread({
      userId,
      threadId,
      summaryText: summary,
      targetMessageId,
    });
    return { messageId, summary };
  });

  return FitnessToolkit.of({
    get_summary: Effect.fn("FitnessToolkit.getSummary")(() =>
      getDataSummary(narrow<HealthfitDatabaseSchema>(db), userId),
    ),
    get_recovery: Effect.fn("FitnessToolkit.getRecovery")(() =>
      buildChatContext(narrow<HealthfitDatabaseSchema>(db), userId).pipe(
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
    get_workout_history: Effect.fn("FitnessToolkit.getWorkoutHistory")(({ limit }) =>
      getWorkoutHistory(narrow<HealthfitDatabaseSchema>(db), userId, limit ?? 10),
    ),
    get_workout_details: Effect.fn("FitnessToolkit.getWorkoutDetails")(function* ({ sessionId }) {
      const details = yield* getWorkoutDetails({
        db: narrow<HealthfitDatabaseSchema>(db),
        userId,
        sessionId,
      });
      if (details === null) {
        return yield* toolError({
          tool: "get_workout_details",
          message: "Workout session not found.",
        });
      }
      return details;
    }),
    get_exercise_progress: Effect.fn("FitnessToolkit.getExerciseProgress")(
      ({ exercise_title, weeks }) =>
        getExerciseProgress(
          narrow<HealthfitDatabaseSchema>(db),
          userId,
          exercise_title,
          weeks ?? 8,
        ),
    ),
    get_sleep_trend: Effect.fn("FitnessToolkit.getSleepTrend")(({ days }) =>
      getSleepTrend(narrow<HealthfitDatabaseSchema>(db), userId, days ?? 7),
    ),
    get_workout_streak: Effect.fn("FitnessToolkit.getWorkoutStreak")(() =>
      getWorkoutStreak(narrow<HealthfitDatabaseSchema>(db), userId),
    ),
    get_training_load: Effect.fn("FitnessToolkit.getTrainingLoad")(({ weeks }) =>
      getTrainingLoad(narrow<HealthfitDatabaseSchema>(db), userId, weeks ?? 4),
    ),
    get_recovery_timeline: Effect.fn("FitnessToolkit.getRecoveryTimeline")(({ days }) =>
      getRecoveryTimeline(narrow<HealthfitDatabaseSchema>(db), userId, days ?? 14),
    ),
    get_goal_progress: Effect.fn("FitnessToolkit.getGoalProgress")(
      ({ days, step_goal, workouts_goal, target_weight_kg }) =>
        getGoalProgress(narrow<HealthfitDatabaseSchema>(db), userId, {
          days,
          stepGoal: step_goal,
          workoutsGoal: workouts_goal,
          targetWeightKg: target_weight_kg,
        }),
    ),
    get_next_workout: Effect.fn("FitnessToolkit.getNextWorkout")(() =>
      getNextWorkout(narrow<HealthfitDatabaseSchema>(db), userId),
    ),
    search_memories: Effect.fn("FitnessToolkit.searchMemories")(({ query, limit }) =>
      memoryDatabase
        .searchMemories({
          userId,
          query,
          options: { limit: limit ?? 10 },
        })
        .pipe(Effect.map((results) => ({ results }))),
    ),
    get_threads: Effect.fn("FitnessToolkit.getThreads")(function* () {
      const conversationId = yield* requireConversationId({ tool: "get_threads" });
      return yield* conversationDatabase.getThreads({ userId, conversationId });
    }),
    read_thread: Effect.fn("FitnessToolkit.readThread")(function* ({ thread_id }) {
      yield* requireThread({ tool: "read_thread", threadId: thread_id });
      const rows = yield* conversationDatabase.getThreadMessages({ userId, threadId: thread_id });
      return rows.map((row) => ({
        ...row,
        parts: Schema.decodeUnknownSync(StoredParts)(row.parts),
      }));
    }),
    read_message: Effect.fn("FitnessToolkit.readMessage")(function* ({ message_id }) {
      const conversationId = yield* requireConversationId({ tool: "read_message" });
      const message = yield* conversationDatabase.getMessage({ userId, messageId: message_id });
      if (message === null || message.conversation_id !== conversationId) {
        return yield* toolError({ tool: "read_message", message: "Message not found." });
      }
      return { ...message, parts: Schema.decodeUnknownSync(StoredParts)(message.parts) };
    }),
    create_thread: Effect.fn("FitnessToolkit.createThread")(function* ({
      anchor_message_id,
      title,
    }) {
      const conversationId = yield* requireConversationId({ tool: "create_thread" });
      const anchor = yield* conversationDatabase.getMessage({
        userId,
        messageId: anchor_message_id,
      });
      if (anchor === null || anchor.conversation_id !== conversationId) {
        return yield* toolError({ tool: "create_thread", message: "Anchor message not found." });
      }
      const threadId = yield* conversationDatabase.createThread({
        userId,
        conversationId,
        anchorMessageId: anchor_message_id,
        title,
      });
      if (threadId === null) {
        return yield* toolError({ tool: "create_thread", message: "Thread not found." });
      }
      return yield* conversationDatabase.getThread({ userId, threadId });
    }),
    summarize_thread: Effect.fn("FitnessToolkit.summarizeThreadTool")(({ thread_id }) =>
      summarize({ threadId: thread_id, tool: "summarize_thread" }),
    ),
    summarize_to_message: Effect.fn("FitnessToolkit.summarizeToMessage")(
      ({ thread_id, target_message_id }) =>
        summarize({
          threadId: thread_id,
          targetMessageId: target_message_id,
          tool: "summarize_to_message",
        }),
    ),
    render_component: Effect.fn("FitnessToolkit.renderComponent")(function* ({ component, props }) {
      const schema = componentSchemas.get(component);
      if (schema === undefined) {
        return yield* toolError({
          tool: "render_component",
          message: `Unknown component: ${component}.`,
        });
      }
      const parsed = Schema.decodeUnknownResult(schema)(props);
      if (Result.isFailure(parsed)) {
        return yield* toolError({
          tool: "render_component",
          message: `Invalid ${component} props: ${String(parsed.failure)}`,
        });
      }
      return {
        spec: {
          root: "root",
          elements: {
            root: {
              type: component,
              props: parsed.success,
            },
          },
        },
      };
    }),
  });
});

export const tools: ToolDefinition[] = Object.values(FitnessToolkit.tools).map((tool) => {
  const parameters: JSONSchema7 = Tool.getJsonSchema(tool);
  if (parameters.type !== "object") {
    throw new Error(`Tool '${tool.name}' parameters must use a root object JSON Schema.`);
  }
  return {
    name: tool.name,
    description: Tool.getDescription(tool) ?? "",
    parameters,
  };
});

export const executeTool = Effect.fn("FitnessToolkit.execute")(function* ({
  db,
  userId,
  name,
  args,
  conversationId,
  summarize,
}: {
  db: ToolsDb;
  userId: string;
  name: string;
  args: Record<string, unknown>;
  conversationId?: string;
  summarize?: ThreadToolOptions["summarize"];
}) {
  if (!(name in FitnessToolkit.tools)) {
    return yield* toolError({ tool: name, message: "Unknown tool." });
  }

  const runtime = yield* FitnessToolkit.pipe(
    Effect.provide(
      FitnessToolkit.toLayer(
        makeHandlers({ db, userId, threadTools: { conversationId, summarize } }).pipe(
          Effect.provide(
            Layer.mergeAll(
              ServerDatabase.conversations.layer({
                db: narrow<ServerDatabase.ConversationDatabaseSchema>(db),
              }),
              ServerDatabase.memories.layer({
                db: narrow<ServerDatabase.MemoryDatabaseSchema>(db),
              }),
            ),
          ),
        ),
      ),
    ),
  );
  const result = yield* runtime
    .handle(name as keyof typeof FitnessToolkit.tools, args as never)
    .pipe(Stream.unwrap, Stream.run(Sink.last()), Effect.flatMap(Effect.fromOption));
  return result.encodedResult;
});
