import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { prepareChatHistory } from "../src/chat/history.ts";
import { ServerDatabase } from "@emi/core/server/database";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";

describe("chat history SQLite integration", () => {
  it("normalizes legacy dynamic tool parts while preparing persisted history", async () => {
    const { db: rawDb, sqlite } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(rawDb);
    const conversationDatabase = await run(
      Effect.gen(function* () {
        return yield* ServerDatabase.conversations;
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );
    const userId = "user-a";
    const conversationId = await run(conversationDatabase.createConversation({ userId }));
    const [messageId] = await run(
      conversationDatabase.saveConversationMessages({
        userId,
        conversationId,
        parentId: null,
        messages: [{ role: "assistant", parts: [{ type: "text", text: "Workout data" }] }],
      }),
    );
    sqlite.prepare("UPDATE messages SET parts = ? WHERE id = ?").run(
      JSON.stringify([
        {
          type: "dynamic-tool",
          toolName: "get_workout_streak",
          toolCallId: "call-1",
          input: {},
          output: { current_streak: 0 },
          outcome: "success",
          state: "output-available",
        },
      ]),
      messageId,
    );

    const history = await run(
      prepareChatHistory({
        userId,
        sessionId: conversationId,
        isTemporary: false,
        chatRequest: {
          messages: [],
          config: { provider: "openai", apiKey: "key", model: "gpt-5" },
        },
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );

    assert.equal("error" in history, false);
    if ("error" in history) return;
    assert.equal(history.requestWithHistory.messages[0]?.parts[0]?.type, "dynamic-tool");
  });

  it("reloads persisted AI SDK file parts while preparing history", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(rawDb);
    const conversationDatabase = await run(
      Effect.gen(function* () {
        return yield* ServerDatabase.conversations;
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );
    const userId = "user-a";
    const conversationId = await run(conversationDatabase.createConversation({ userId }));
    await run(
      conversationDatabase.saveConversationMessages({
        userId,
        conversationId,
        parentId: null,
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "file",
                filename: "meal.jpg",
                mediaType: "image/jpeg",
                url: "data:image/jpeg;base64,/9j/4AAQ",
              },
            ],
          },
        ],
      }),
    );

    const history = await run(
      prepareChatHistory({
        userId,
        sessionId: conversationId,
        isTemporary: false,
        chatRequest: {
          messages: [],
          config: { provider: "openai", apiKey: "key", model: "gpt-5" },
        },
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );

    assert.equal("error" in history, false);
    if ("error" in history) return;
    const firstPart = history.requestWithHistory.messages[0]?.parts[0];
    assert.equal(firstPart?.type, "file");
    if (firstPart?.type !== "file") return;
    assert.equal(firstPart.filename, "meal.jpg");
    assert.equal(firstPart.mediaType, "image/jpeg");
    assert.equal(firstPart.url, "data:image/jpeg;base64,/9j/4AAQ");
  });

  it("keeps the client message id addressable after initial persistence", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(rawDb);
    const conversationDatabase = await run(
      Effect.gen(function* () {
        return yield* ServerDatabase.conversations;
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );
    const userId = "user-a";
    const conversationId = await run(conversationDatabase.createConversation({ userId }));
    const messageId = "d007dd8e-8138-484d-bd5c-3f9676ba314e";

    const history = await run(
      prepareChatHistory({
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
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );

    assert.equal("error" in history, false);
    assert.equal(history.lastIncomingMessageId, messageId);
    assert.equal(
      (await run(conversationDatabase.getMessage({ userId, messageId })))?.id,
      messageId,
    );
    assert.equal(
      await run(
        conversationDatabase.reviseConversationMessage({
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
