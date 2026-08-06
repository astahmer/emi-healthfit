import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { prepareChatHistory } from "../src/chat/history.ts";
import { attachmentUrlPrefix } from "../src/chat/attachment-storage.ts";
import { ServerDatabase } from "@emi/core/server/database";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";
import { makeFakeBucket } from "./fake-bucket.ts";

const dataUrl = ({ bytes, mediaType = "image/jpeg" }: { bytes: number; mediaType?: string }) =>
  `data:${mediaType};base64,${"A".repeat(Math.ceil((bytes * 4) / 3))}`;

describe("chat history attachment persistence SQLite integration", () => {
  it("stores photo attachments in the bucket and replays them as data URLs", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(rawDb);
    const conversationDatabase = await run(
      Effect.gen(function* () {
        return yield* ServerDatabase.conversations;
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );
    const { bucket, objects } = makeFakeBucket();
    const userId = "user-a";
    const conversationId = await run(conversationDatabase.createConversation({ userId }));
    const photo = dataUrl({ bytes: 1_200_000 });

    const firstTurn = await run(
      prepareChatHistory({
        userId,
        sessionId: conversationId,
        isTemporary: false,
        bucket,
        chatRequest: {
          messages: [
            {
              id: "user-1",
              role: "user",
              parts: [
                { type: "text", text: "what is in these photos?" },
                { type: "file", url: photo, mediaType: "image/jpeg", filename: "photo-1.jpg" },
                { type: "file", url: photo, mediaType: "image/jpeg", filename: "photo-2.jpg" },
                { type: "file", url: photo, mediaType: "image/jpeg", filename: "photo-3.jpg" },
              ],
            },
          ],
          config: { provider: "openai", apiKey: "key", model: "gpt-5" },
        },
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );

    assert.equal("error" in firstTurn, false);
    if ("error" in firstTurn) return;
    assert.equal(firstTurn.requestWithHistory.messages[0]?.parts[1]?.type, "file");
    assert.equal(objects.size, 3);

    const rows = await run(
      conversationDatabase.getConversationMessages({ userId, conversationId }),
    );
    assert.equal(rows.length, 1);
    const storedParts = JSON.parse(rows[0]?.parts ?? "[]");
    assert.equal(JSON.stringify(storedParts).includes("data:image/jpeg;base64,"), false);
    for (const part of storedParts.slice(1)) {
      assert.ok(String(part.url).startsWith(attachmentUrlPrefix));
    }

    const secondTurn = await run(
      prepareChatHistory({
        userId,
        sessionId: conversationId,
        isTemporary: false,
        bucket,
        chatRequest: {
          messages: [
            {
              id: "user-2",
              role: "user",
              parts: [{ type: "text", text: "tell me more" }],
            },
          ],
          config: { provider: "openai", apiKey: "key", model: "gpt-5" },
        },
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );

    assert.equal("error" in secondTurn, false);
    if ("error" in secondTurn) return;
    const replayedUserMessage = secondTurn.requestWithHistory.messages[0];
    assert.equal(replayedUserMessage?.role, "user");
    for (const part of replayedUserMessage?.parts.slice(1) ?? []) {
      assert.equal(part.type, "file");
      if (part.type === "file") assert.ok(part.url.startsWith("data:image/jpeg;base64,"));
    }
  });

  it("keeps legacy base64 attachment rows readable for the provider", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(rawDb);
    const conversationDatabase = await run(
      Effect.gen(function* () {
        return yield* ServerDatabase.conversations;
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );
    const { bucket, objects } = makeFakeBucket();
    const userId = "user-a";
    const conversationId = await run(conversationDatabase.createConversation({ userId }));
    const photo = dataUrl({ bytes: 50_000 });
    await run(
      conversationDatabase.saveConversationMessages({
        userId,
        conversationId,
        parentId: null,
        messages: [
          {
            role: "user",
            parts: [{ type: "file", url: photo, mediaType: "image/jpeg", filename: "legacy.jpg" }],
          },
        ],
      }),
    );

    const history = await run(
      prepareChatHistory({
        userId,
        sessionId: conversationId,
        isTemporary: false,
        bucket,
        chatRequest: {
          messages: [],
          config: { provider: "openai", apiKey: "key", model: "gpt-5" },
        },
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );

    assert.equal("error" in history, false);
    if ("error" in history) return;
    assert.equal(objects.size, 0);
    const part = history.requestWithHistory.messages[0]?.parts[0];
    assert.equal(part?.type, "file");
    if (part?.type === "file") assert.equal(part.url, photo);
  });

  it("rejects messages whose persisted JSON would exceed the D1 row budget", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(rawDb);
    const conversationDatabase = await run(
      Effect.gen(function* () {
        return yield* ServerDatabase.conversations;
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );
    const { bucket, objects } = makeFakeBucket();
    const userId = "user-a";
    const conversationId = await run(conversationDatabase.createConversation({ userId }));

    const outcome = await run(
      prepareChatHistory({
        userId,
        sessionId: conversationId,
        isTemporary: false,
        bucket,
        chatRequest: {
          messages: [
            {
              id: "user-1",
              role: "user",
              parts: [{ type: "text", text: "x".repeat(2_000_000) }],
            },
          ],
          config: { provider: "openai", apiKey: "key", model: "gpt-5" },
        },
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );

    assert.equal("error" in outcome, true);
    if (!("error" in outcome)) return;
    assert.equal(outcome.status, 400);
    assert.match(outcome.error, /too large to store/);
    assert.equal(objects.size, 0);
    const rows = await run(
      conversationDatabase.getConversationMessages({ userId, conversationId }),
    );
    assert.equal(rows.length, 0);
  });
});
