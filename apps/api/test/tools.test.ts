import assert from "node:assert";
import { describe, it } from "node:test";
import { ServerDatabase } from "@emi/core/server/database";
import { HealthFit, type HealthfitToolsDatabaseSchema } from "@emi/flavor-healthfit";
import { makeConversationDatabase, makeSqliteDatabase, run } from "./sqlite.ts";
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
