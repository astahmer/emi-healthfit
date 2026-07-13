import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as Effect from "effect/Effect";
import { z } from "zod";
import { getDataSummary, type QueryDatabaseClient } from "../db/operations.ts";
import { buildChatContext } from "../chat/context.ts";

export const buildMcpServer = (
  db: QueryDatabaseClient,
  run: <A, E>(effect: Effect.Effect<A, E, never>) => Promise<A>,
): McpServer => {
  const server = new McpServer({
    name: "emi-healthfit",
    version: "0.1.0",
  });

  server.registerTool(
    "get_summary",
    {
      title: "Get data summary",
      description: "Returns a summary of imported health and workout data.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const summary = await run(getDataSummary(db));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_recovery",
    {
      title: "Get recovery status",
      description: "Returns today's recovery score and supporting stats.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const ctx = await run(buildChatContext(db));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
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
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "query_database",
    {
      title: "Query database",
      description:
        "Run a read-only SQL query against the gym data D1 database.",
      inputSchema: { query: z.string().describe("A single read-only SQL query.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query }: { query: string }) => {
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
        return {
          content: [
            {
              type: "text" as const,
              text: "Only read-only queries are allowed.",
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await run(db.prepare(query).all<unknown>());
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.results, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
};
