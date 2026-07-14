import * as Effect from "effect/Effect";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import type { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import type { JSONSchema7 } from "json-schema";
import {
  getDataSummary,
  getExerciseProgress,
  getSleepTrend,
  getWorkoutHistory,
  getWorkoutStreak,
  searchMemories,
  type QueryDatabaseClient,
} from "../db/operations.ts";
import { buildChatContext } from "../chat/context.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema7;
}

const tools: ToolDefinition[] = [
  {
    name: "get_summary",
    description: "Returns a summary of imported health and workout data.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_recovery",
    description: "Returns today's recovery score and supporting stats.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "query_database",
    description: "Run a read-only SQL query against the gym data D1 database.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "A single read-only SQL query.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_workout_history",
    description: "List recent strength workouts with date, title, volume, exercise count, and set count.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Maximum number of workouts to return (default 10).",
        },
      },
    },
  },
  {
    name: "get_exercise_progress",
    description: "Get weight, rep, and volume trend plus the current PR for a specific exercise over recent weeks.",
    parameters: {
      type: "object",
      properties: {
        exercise_title: {
          type: "string",
          description: "Exact exercise name as it appears in Hevy (e.g. 'Bench Press (Barbell)').",
        },
        weeks: {
          type: "integer",
          description: "Number of weeks to look back (default 8).",
        },
      },
      required: ["exercise_title"],
    },
  },
  {
    name: "get_sleep_trend",
    description: "Get average sleep duration over the last N days.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          description: "Number of days to average (default 7).",
        },
      },
    },
  },
  {
    name: "get_workout_streak",
    description: "Get current and longest consecutive workout streaks from Hevy sessions.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "search_memories",
    description:
      "Search previously saved memory snippets from past sessions. Use when the user asks something that may have been discussed before.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search terms to match against saved memory snippets.",
        },
        limit: {
          type: "integer",
          description: "Maximum number of memories to return (default 10).",
        },
      },
      required: ["query"],
    },
  },
];

export const handleToolsList = () =>
  Effect.gen(function* () {
    return yield* HttpServerResponse.json({ tools });
  });

export const handleToolExecute = (
  db: QueryDatabaseClient,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const url = new URL(request.url, "http://localhost");
    const name = url.pathname.split("/").pop();
    const tool = tools.find((t) => t.name === name);

    if (tool === undefined) {
      return yield* HttpServerResponse.json(
        { error: "Tool not found" },
        { status: 404 },
      );
    }

    const text = yield* request.text;
    const args = JSON.parse(text || "{}") as Record<string, unknown>;
    const result = yield* executeTool(db, tool.name, args);
    return yield* HttpServerResponse.json(result);
  }).pipe(
    Effect.catch((error) =>
      Effect.gen(function* () {
        return yield* HttpServerResponse.json(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 500 },
        );
      }),
    ),
  );

const executeTool = (
  db: QueryDatabaseClient,
  name: string,
  args: Record<string, unknown>,
) => {
  switch (name) {
    case "get_summary":
      return getDataSummary(db);
    case "get_recovery":
      return buildChatContext(db).pipe(
        Effect.map((ctx) => ({
          today: ctx.today,
          label: ctx.recoveryLabel,
          explanation: ctx.recoveryExplanation,
          lastWorkout: ctx.lastWorkout.lastSessionSummary,
          sleepAverageHours:
            ctx.sleep.sevenDayAverage !== null
              ? ctx.sleep.sevenDayAverage / 60
              : null,
          recentWorkoutCount: ctx.recentWorkoutCount,
          recentVolume: ctx.lastWorkout.recentVolume,
        })),
      );
    case "query_database": {
      const query = args.query;
      if (typeof query !== "string") {
        return Effect.fail(new Error("query is required"));
      }
      const writeCommands = [
        "insert",
        "update",
        "delete",
        "drop",
        "alter",
        "create",
        "pragma",
      ];
      const normalized = query.trim().toLowerCase();
      if (writeCommands.some((cmd) => normalized.startsWith(cmd))) {
        return Effect.fail(new Error("Only read-only queries are allowed."));
      }
      return db.prepare(query).all<unknown>().pipe(
        Effect.map((result) => result.results),
      );
    }
    case "get_workout_history": {
      const limit = typeof args.limit === "number" ? args.limit : 10;
      return getWorkoutHistory(db, limit);
    }
    case "get_exercise_progress": {
      const exerciseTitle = args.exercise_title;
      if (typeof exerciseTitle !== "string") {
        return Effect.fail(new Error("exercise_title is required"));
      }
      const weeks = typeof args.weeks === "number" ? args.weeks : 8;
      return getExerciseProgress(db, exerciseTitle, weeks);
    }
    case "get_sleep_trend": {
      const days = typeof args.days === "number" ? args.days : 7;
      return getSleepTrend(db, days);
    }
    case "get_workout_streak":
      return getWorkoutStreak(db);
    case "search_memories": {
      const query = args.query;
      if (typeof query !== "string") {
        return Effect.fail(new Error("query is required"));
      }
      const limit = typeof args.limit === "number" ? args.limit : 10;
      return searchMemories(db, query, limit).pipe(
        Effect.map((results) => ({ results })),
      );
    }
    default:
      return Effect.fail(new Error(`Unknown tool: ${name}`));
  }
};
