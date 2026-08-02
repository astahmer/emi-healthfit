import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareChatHistory } from "../src/core/routes/chat-history.ts";
import { ServerDatabase } from "@emi/core/server/database";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeLayerRunner, makeSqliteDatabase, run } from "./sqlite.ts";

const { createConversation, getMessage, reviseConversationMessage } = ServerDatabase.conversations;

describe("chat history SQLite integration", () => {
  it("keeps the client message id addressable after initial persistence", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(rawDb);
    const runConversation = makeLayerRunner(ServerDatabase.conversations.layer({ db }));
    const userId = "user-a";
    const conversationId = await runConversation(createConversation({ userId }));
    const messageId = "d007dd8e-8138-484d-bd5c-3f9676ba314e";

    const history = await run(
      prepareChatHistory({
        db: rawDb,
        userId,
        sessionId: conversationId,
        isTemporary: false,
        chatRequest: {
          messages: [
            {
              id: messageId,
              role: "user",
              parts: [{ type: "text", text: "Build me a plan" }],
            },
          ],
          config: { provider: "openai", apiKey: "key", model: "gpt-5" },
        },
      }),
    );

    assert.equal("error" in history, false);
    assert.equal(history.lastIncomingMessageId, messageId);
    assert.equal((await runConversation(getMessage({ userId, messageId })))?.id, messageId);
    assert.equal(
      await runConversation(
        reviseConversationMessage({
          userId,
          conversationId,
          messageId,
          parts: [{ type: "text", text: "Build me a recovery plan" }],
        }),
      ),
      true,
    );
  });
});
