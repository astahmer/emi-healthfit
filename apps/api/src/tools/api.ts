import * as Effect from "effect/Effect";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import type { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import type { JSONSchema7 } from "json-schema";
import { getDataSummary, type QueryDatabaseClient } from "../db/operations.ts";
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
    default:
      return Effect.fail(new Error(`Unknown tool: ${name}`));
  }
};
