import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createConversation,
  getMessage,
  reviseConversationMessage,
} from "../src/core/db/conversations.ts";
import { prepareChatHistory } from "../src/core/routes/chat-history.ts";
import type { ConversationDatabaseSchema } from "@emi/core/server";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";

describe("chat history SQLite integration", () => {
  it("keeps the client message id addressable after initial persistence", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ConversationDatabaseSchema>(rawDb);
    const userId = "user-a";
    const conversationId = await run(createConversation(db, userId));
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
    assert.equal((await run(getMessage(db, userId, messageId)))?.id, messageId);
    assert.equal(
      await run(
        reviseConversationMessage({
          db,
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
