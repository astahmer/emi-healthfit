import assert from "node:assert";
import { describe, it } from "node:test";
import { ServerDatabase } from "@emi/core/server/database";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeConversationDatabase, makeSqliteDatabase, run } from "./sqlite.ts";

describe("conversations SQLite integration", () => {
  it("persists conversation, branch, summary, suggestion, and revision lifecycle", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(rawDb);
    const conversationDatabase = await makeConversationDatabase(db);
    const userId = "user-a";
    const conversationId = await run(
      conversationDatabase.createConversation({ userId, title: "Running plan" }),
    );
    const [questionId] = await run(
      conversationDatabase.saveConversationMessages({
        userId,
        conversationId,
        parentId: null,
        messages: [{ role: "user", parts: [{ type: "text", text: "Help with recovery" }] }],
      }),
    );
    const [answerId] = await run(
      conversationDatabase.saveConversationMessages({
        userId,
        conversationId,
        parentId: questionId,
        messages: [
          {
            role: "assistant",
            parts: [{ type: "text", text: "Take an easy day" }],
            usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
            model: "gpt-5",
          },
        ],
      }),
    );
    assert.ok(questionId);
    assert.ok(answerId);

    await run(
      conversationDatabase.renameConversation({ userId, conversationId, title: "Recovery plan" }),
    );
    await run(
      conversationDatabase.updateConversationState({
        userId,
        conversationId,
        status: "archived",
        pinned: true,
      }),
    );
    assert.deepStrictEqual(
      (await run(conversationDatabase.getConversations({ userId }))).map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        status: conversation.status,
        pinned: conversation.pinned,
      })),
      [{ id: conversationId, title: "Recovery plan", status: "archived", pinned: true }],
    );
    assert.deepStrictEqual(
      (await run(conversationDatabase.getConversations({ userId, search: "easy day" }))).map(
        (conversation) => conversation.id,
      ),
      [conversationId],
    );

    const threadId = await run(
      conversationDatabase.createThread({
        userId,
        conversationId,
        anchorMessageId: questionId,
        title: "Recovery branch",
      }),
    );
    assert.ok(threadId);
    await run(conversationDatabase.addThreadMessage({ userId, threadId, messageId: answerId }));
    await run(conversationDatabase.renameThread({ userId, threadId, title: "Recovery details" }));
    await run(conversationDatabase.pinThread({ userId, threadId, pinned: true }));
    assert.deepStrictEqual(
      (await run(conversationDatabase.getThreadMessages({ userId, threadId }))).map(
        (message) => message.id,
      ),
      [questionId, answerId],
    );
    assert.deepStrictEqual(
      (await run(conversationDatabase.getThreads({ userId, conversationId }))).map((thread) => ({
        id: thread.id,
        title: thread.title,
        pinned: thread.pinned,
      })),
      [{ id: threadId, title: "Recovery details", pinned: true }],
    );
    assert.strictEqual(
      (
        await run(
          conversationDatabase.getThreadByAnchor({
            userId,
            conversationId,
            anchorMessageId: questionId,
          }),
        )
      )?.id,
      threadId,
    );

    const summaryId = await run(
      conversationDatabase.summarizeThread({ userId, threadId, summaryText: "Keep volume low." }),
    );
    assert.ok(summaryId);
    assert.deepStrictEqual(
      await run(conversationDatabase.getMessage({ userId, messageId: summaryId })),
      {
        id: summaryId,
        conversation_id: conversationId,
        parent_id: questionId,
        role: "summary",
        parts: JSON.stringify([{ type: "text", text: "Keep volume low." }]),
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        model: null,
        created_at: (await run(conversationDatabase.getMessage({ userId, messageId: summaryId })))
          ?.created_at,
      },
    );

    await run(
      conversationDatabase.saveSuggestions({
        userId,
        id: "suggestion-key",
        suggestions: ["Walk", "Sleep"],
      }),
    );
    await run(
      conversationDatabase.saveSuggestions({
        userId,
        id: "suggestion-key",
        suggestions: ["Ignored"],
      }),
    );
    assert.deepStrictEqual(
      (await run(conversationDatabase.getSuggestionsById({ userId, id: "suggestion-key" })))
        ?.suggestions,
      JSON.stringify(["Walk", "Sleep"]),
    );

    await run(conversationDatabase.discardThread({ userId, threadId }));
    assert.deepStrictEqual(
      await run(conversationDatabase.getThreads({ userId, conversationId })),
      [],
    );
    assert.strictEqual(
      (await run(conversationDatabase.getThreadsIncludingDiscarded({ userId, conversationId })))[0]
        ?.status,
      "discarded",
    );
    await run(conversationDatabase.restoreThread({ userId, threadId }));
    assert.strictEqual(
      (await run(conversationDatabase.getThread({ userId, threadId })))?.status,
      "regular",
    );

    assert.strictEqual(
      await run(
        conversationDatabase.reviseConversationMessage({
          userId,
          conversationId,
          messageId: questionId,
          parts: [{ type: "text", text: "How should I recover?" }],
          threadId,
        }),
      ),
      true,
    );
    assert.deepStrictEqual(
      (await run(conversationDatabase.getThreadMessages({ userId, threadId }))).map((message) => ({
        id: message.id,
        parts: message.parts,
      })),
      [
        {
          id: questionId,
          parts: JSON.stringify([{ type: "text", text: "How should I recover?" }]),
        },
      ],
    );
  });

  it("creates a conversation with a batch of root messages in order", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(rawDb);
    const conversationDatabase = await makeConversationDatabase(db);
    const userId = "user-a";
    const conversationId = await run(
      conversationDatabase.createConversation({ userId, title: "Kept ghost" }),
    );
    await run(
      conversationDatabase.saveConversationMessages({
        userId,
        conversationId,
        parentId: null,
        messages: [
          { role: "user", parts: [{ type: "text", text: "Ghost note" }] },
          { role: "assistant", parts: [{ type: "text", text: "Ghost reply" }] },
        ],
      }),
    );
    const messages = await run(
      conversationDatabase.getConversationMessages({ userId, conversationId }),
    );
    assert.deepStrictEqual(
      messages.map((message) => ({
        role: message.role,
        parent_id: message.parent_id,
        parts: message.parts,
      })),
      [
        {
          role: "user",
          parent_id: null,
          parts: JSON.stringify([{ type: "text", text: "Ghost note" }]),
        },
        {
          role: "assistant",
          parent_id: null,
          parts: JSON.stringify([{ type: "text", text: "Ghost reply" }]),
        },
      ],
    );
    assert.ok(messages[0] !== undefined && messages[1] !== undefined);
    assert.ok(messages[0].created_at <= messages[1].created_at);
  });

  it("clones linked messages and threads, then deletes only owned original conversation", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(rawDb);
    const conversationDatabase = await makeConversationDatabase(db);
    const alice = "user-a";
    const bob = "user-b";
    const conversationId = await run(
      conversationDatabase.createConversation({ userId: alice, title: "Strength plan" }),
    );
    const [rootId] = await run(
      conversationDatabase.saveConversationMessages({
        userId: alice,
        conversationId,
        parentId: null,
        messages: [{ role: "user", parts: [{ type: "text", text: "Plan bench" }] }],
      }),
    );
    const [childId] = await run(
      conversationDatabase.saveConversationMessages({
        userId: alice,
        conversationId,
        parentId: rootId,
        messages: [{ role: "assistant", parts: [{ type: "text", text: "Add five kilos" }] }],
      }),
    );
    const threadId = await run(
      conversationDatabase.createThread({ userId: alice, conversationId, anchorMessageId: rootId }),
    );
    assert.ok(threadId);
    await run(
      conversationDatabase.addThreadMessage({ userId: alice, threadId, messageId: childId }),
    );

    const cloned = await run(
      conversationDatabase.cloneConversation({ userId: alice, conversationId }),
    );
    assert.ok(cloned);
    assert.strictEqual(cloned.title, "Strength plan copy");
    const clonedMessages = await run(
      conversationDatabase.getConversationMessages({ userId: alice, conversationId: cloned.id }),
    );
    const clonedThreads = await run(
      conversationDatabase.getThreadsIncludingDiscarded({
        userId: alice,
        conversationId: cloned.id,
      }),
    );
    assert.strictEqual(clonedMessages.length, 2);
    assert.strictEqual(clonedMessages[1]?.parent_id, clonedMessages[0]?.id);
    assert.strictEqual(clonedThreads.length, 1);
    assert.deepStrictEqual(
      (
        await run(
          conversationDatabase.getThreadMessages({
            userId: alice,
            threadId: clonedThreads[0]?.id ?? "",
          }),
        )
      )
        .map((message) => message.id)
        .toSorted(),
      clonedMessages.map((message) => message.id).toSorted(),
    );
    assert.strictEqual(
      await run(conversationDatabase.cloneConversation({ userId: bob, conversationId })),
      null,
    );

    await run(conversationDatabase.deleteConversation({ userId: bob, conversationId }));
    assert.ok(await run(conversationDatabase.getConversation({ userId: alice, conversationId })));
    await run(conversationDatabase.deleteConversation({ userId: alice, conversationId }));
    assert.strictEqual(
      await run(conversationDatabase.getConversation({ userId: alice, conversationId })),
      null,
    );
    assert.ok(
      await run(conversationDatabase.getConversation({ userId: alice, conversationId: cloned.id })),
    );
  });
});
