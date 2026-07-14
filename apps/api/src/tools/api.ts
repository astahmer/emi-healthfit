import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as Tool from "effect/unstable/ai/Tool";
import * as Toolkit from "effect/unstable/ai/Toolkit";
import type { JSONSchema7 } from "json-schema";
import { buildChatContext } from "../chat/context.ts";
import {
  createThread,
  getDataSummary,
  getExerciseProgress,
  getMessage,
  getSleepTrend,
  getThread,
  getThreadMessages,
  getThreads,
  getWorkoutHistory,
  getWorkoutStreak,
  searchMemories,
  summarizeThread,
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
  threadTools,
}: {
  db: QueryDatabaseClient;
  threadTools: ThreadToolOptions;
}) {
  const services = yield* Effect.context<RuntimeContext>();
  const requireConversationId = (tool: string) =>
    threadTools.conversationId === undefined
      ? Effect.fail(toolError({ tool, message: "A persisted conversation is required." }))
      : Effect.succeed(threadTools.conversationId);
  const requireThread = Effect.fn("FitnessToolkit.requireThread")(function* ({
    tool,
    threadId,
  }: {
    tool: string;
    threadId: string;
  }) {
    const conversationId = yield* requireConversationId(tool);
    const thread = yield* getThread(db, threadId).pipe(Effect.provideContext(services));
    if (thread === null || thread.conversation_id !== conversationId) {
      return yield* Effect.fail(toolError({ tool, message: "Thread not found." }));
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
      return yield* Effect.fail(toolError({ tool, message: "Summarization is unavailable." }));
    }
    const rows = yield* getThreadMessages(db, threadId).pipe(Effect.provideContext(services));
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
    const messageId = yield* summarizeThread(db, threadId, summary, targetMessageId).pipe(
      Effect.provideContext(services),
    );
    return { messageId, summary };
  });

  return FitnessToolkit.of({
    get_summary: Effect.fn("FitnessToolkit.getSummary")(() =>
      getDataSummary(db).pipe(Effect.provideContext(services)),
    ),
    get_recovery: Effect.fn("FitnessToolkit.getRecovery")(() =>
      buildChatContext(db).pipe(
        Effect.provideContext(services),
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
      const result = yield* db
        .prepare(normalized)
        .all<unknown>()
        .pipe(Effect.provideContext(services));
      return result.results;
    }),
    get_workout_history: Effect.fn("FitnessToolkit.getWorkoutHistory")(({ limit }) =>
      getWorkoutHistory(db, limit ?? 10).pipe(Effect.provideContext(services)),
    ),
    get_exercise_progress: Effect.fn("FitnessToolkit.getExerciseProgress")(
      ({ exercise_title, weeks }) =>
        getExerciseProgress(db, exercise_title, weeks ?? 8).pipe(Effect.provideContext(services)),
    ),
    get_sleep_trend: Effect.fn("FitnessToolkit.getSleepTrend")(({ days }) =>
      getSleepTrend(db, days ?? 7).pipe(Effect.provideContext(services)),
    ),
    get_workout_streak: Effect.fn("FitnessToolkit.getWorkoutStreak")(() =>
      getWorkoutStreak(db).pipe(Effect.provideContext(services)),
    ),
    search_memories: Effect.fn("FitnessToolkit.searchMemories")(({ query, limit }) =>
      searchMemories(db, query, limit ?? 10).pipe(
        Effect.provideContext(services),
        Effect.map((results) => ({ results })),
      ),
    ),
    get_threads: Effect.fn("FitnessToolkit.getThreads")(function* () {
      const conversationId = yield* requireConversationId("get_threads");
      return yield* getThreads(db, conversationId).pipe(Effect.provideContext(services));
    }),
    read_thread: Effect.fn("FitnessToolkit.readThread")(function* ({ thread_id }) {
      yield* requireThread({ tool: "read_thread", threadId: thread_id });
      const rows = yield* getThreadMessages(db, thread_id).pipe(Effect.provideContext(services));
      return rows.map((row) => ({
        ...row,
        parts: Schema.decodeUnknownSync(StoredParts)(row.parts),
      }));
    }),
    read_message: Effect.fn("FitnessToolkit.readMessage")(function* ({ message_id }) {
      const conversationId = yield* requireConversationId("read_message");
      const message = yield* getMessage(db, message_id).pipe(Effect.provideContext(services));
      if (message === null || message.conversation_id !== conversationId) {
        return yield* Effect.fail(
          toolError({ tool: "read_message", message: "Message not found." }),
        );
      }
      return { ...message, parts: Schema.decodeUnknownSync(StoredParts)(message.parts) };
    }),
    create_thread: Effect.fn("FitnessToolkit.createThread")(function* ({
      anchor_message_id,
      title,
    }) {
      const conversationId = yield* requireConversationId("create_thread");
      const anchor = yield* getMessage(db, anchor_message_id).pipe(Effect.provideContext(services));
      if (anchor === null || anchor.conversation_id !== conversationId) {
        return yield* Effect.fail(
          toolError({ tool: "create_thread", message: "Anchor message not found." }),
        );
      }
      const threadId = yield* createThread(db, conversationId, anchor_message_id, title).pipe(
        Effect.provideContext(services),
      );
      return yield* getThread(db, threadId).pipe(Effect.provideContext(services));
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
  name,
  args,
  conversationId,
  summarize,
}: {
  db: QueryDatabaseClient;
  name: string;
  args: Record<string, unknown>;
  conversationId?: string;
  summarize?: ThreadToolOptions["summarize"];
}) {
  if (!(name in FitnessToolkit.tools)) {
    return yield* Effect.fail(toolError({ tool: name, message: "Unknown tool." }));
  }

  const runtime = yield* FitnessToolkit.pipe(
    Effect.provide(
      FitnessToolkit.toLayer(makeHandlers({ db, threadTools: { conversationId, summarize } })),
    ),
  );
  const result = yield* runtime
    .handle(name as keyof typeof FitnessToolkit.tools, args as never)
    .pipe(Stream.unwrap, Stream.run(Sink.last()), Effect.flatMap(Effect.fromOption));
  return result.encodedResult;
});
import { RuntimeContext } from "alchemy";
