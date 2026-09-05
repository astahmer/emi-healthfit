import assert from "node:assert";
import { describe, it } from "node:test";
import { ServerDatabase } from "@emi/core/server/database";
import { HealthFit, type HealthfitToolsDatabaseSchema } from "@emi/flavor-healthfit";
import { makeConversationDatabase, makeMemoryDatabase, makeSqliteDatabase, run } from "./sqlite.ts";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";

const { definitions: tools } = HealthFit.tools;

describe("conversation thread tools", () => {
  it("searches previous owned conversations while excluding the current one", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const conversationDb =
      narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(rawDb);
    const toolsDb = narrowQueryDatabaseClient<HealthfitToolsDatabaseSchema>(rawDb);
    const conversationDatabase = await makeConversationDatabase(conversationDb);
    const userId = "tool-user";
    const previousConversationId = await run(
      conversationDatabase.createConversation({ userId, title: "Previous recovery" }),
    );
    const [messageId] = await run(
      conversationDatabase.saveConversationMessages({
        userId,
        conversationId: previousConversationId,
        parentId: null,
        messages: [{ role: "user", parts: [{ type: "text", text: "Remember my deload plan" }] }],
      }),
    );
    const currentConversationId = await run(
      conversationDatabase.createConversation({ userId, title: "Current conversation" }),
    );
    await run(
      conversationDatabase.saveConversationMessages({
        userId,
        conversationId: currentConversationId,
        parentId: null,
        messages: [{ role: "user", parts: [{ type: "text", text: "deload plan" }] }],
      }),
    );

    const result = await run(
      HealthFit.tools.execute({
        db: toolsDb,
        userId,
        name: "search_conversations",
        args: { query: "deload", limit: 5 },
        conversationId: currentConversationId,
      }),
    );

    assert.deepStrictEqual(result, {
      results: [
        {
          conversation_id: previousConversationId,
          conversation_title: "Previous recovery",
          message_id: messageId,
          message_role: "user",
          parts: [{ type: "text", text: "Remember my deload plan" }],
        },
      ],
    });
  });

  it("searches the merged memory summary before individual memory entries", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const toolsDb = narrowQueryDatabaseClient<HealthfitToolsDatabaseSchema>(rawDb);
    const memoryDb = narrowQueryDatabaseClient<ServerDatabase.MemoryDatabaseSchema>(rawDb);
    const memoryDatabase = await makeMemoryDatabase(memoryDb);
    const userId = "memory-tool-user";
    await run(
      memoryDatabase.insertMemory({
        userId,
        content: "The user prefers concise recovery plans.",
        source: "manual",
      }),
    );
    await run(
      memoryDatabase.upsertMemorySummary({
        userId,
        content: "The user prefers concise recovery plans.",
        memoryCount: 1,
      }),
    );

    const summary = await run(
      HealthFit.tools.execute({
        db: toolsDb,
        userId,
        name: "search_memory_summary",
        args: { query: "concise recovery" },
      }),
    );
    const summaryPayload = JSON.parse(JSON.stringify(summary));
    assert.deepStrictEqual(summaryPayload, {
      summary: {
        content: "The user prefers concise recovery plans.",
        memory_count: 1,
        updated_at: summaryPayload.summary.updated_at,
      },
    });

    const details = await run(
      HealthFit.tools.execute({
        db: toolsDb,
        userId,
        name: "search_memories",
        args: { query: "recovery" },
      }),
    );
    const detailPayload = JSON.parse(JSON.stringify(details));
    assert.deepStrictEqual(detailPayload.results, [
      {
        id: detailPayload.results[0].id,
        content: "The user prefers concise recovery plans.",
        source: "manual",
        thread_id: null,
        created_at: detailPayload.results[0].created_at,
        deleted: false,
        rank: 3,
      },
    ]);
  });

  it("accepts explicit null for omitted goal arguments from a model", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const toolsDb = narrowQueryDatabaseClient<HealthfitToolsDatabaseSchema>(rawDb);

    assert.deepStrictEqual(
      await run(
        HealthFit.tools.execute({
          db: toolsDb,
          userId: "null-goal-user",
          name: "get_goal_progress",
          args: {
            days: null,
            step_goal: null,
            workouts_goal: null,
            target_weight_kg: null,
          },
        }),
      ),
      {
        period_days: 7,
        average_steps: null,
        step_goal: null,
        workouts: 0,
        workouts_goal: null,
        latest_weight_kg: null,
        latest_weight_date: null,
        target_weight_kg: null,
        weight_remaining_kg: null,
      },
    );
  });

  it("rejects disabled sleep tools even when called directly", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const toolsDb = narrowQueryDatabaseClient<HealthfitToolsDatabaseSchema>(rawDb);

    await assert.rejects(
      run(
        HealthFit.tools.execute({
          db: toolsDb,
          userId: "disabled-sleep-tool-user",
          name: "get_sleep_trend",
          args: {},
        }),
      ),
      (error: unknown) => error instanceof Error && error.message === "Unknown tool.",
    );
  });

  it("does not expose unscoped SQL", () => {
    assert.ok(!tools.some((tool) => tool.name === "query_database"));
  });
  it("exposes the explicit thread tool surface", () => {
    const names = new Set(tools.map((tool) => tool.name));
    assert.deepStrictEqual(
      [
        "get_threads",
        "read_thread",
        "read_message",
        "create_thread",
        "summarize_thread",
        "summarize_to_message",
      ].filter((name) => !names.has(name)),
      [],
    );
  });

  it("exposes provider-compatible object schemas for every tool", () => {
    for (const tool of tools) {
      assert.strictEqual(tool.parameters.type, "object", tool.name);
      assert.ok(!("anyOf" in tool.parameters), tool.name);
    }
  });
});
