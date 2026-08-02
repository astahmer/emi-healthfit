import assert from "node:assert";
import { describe, it } from "node:test";
import { ServerDatabase } from "@emi/core/server/database";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeLayerRunner, makeSqliteDatabase } from "./sqlite.ts";

const {
  addThreadMessage,
  cloneConversation,
  createConversation,
  createThread,
  deleteConversation,
  discardThread,
  getConversation,
  getConversationMessages,
  getConversations,
  getMessage,
  getSuggestionsById,
  getThread,
  getThreadByAnchor,
  getThreadMessages,
  getThreads,
  getThreadsIncludingDiscarded,
  pinThread,
  renameConversation,
  renameThread,
  restoreThread,
  reviseConversationMessage,
  saveConversationMessages,
  saveSuggestions,
  summarizeThread,
  updateConversationState,
} = ServerDatabase.conversations;

describe("conversations SQLite integration", () => {
  it("persists conversation, branch, summary, suggestion, and revision lifecycle", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(rawDb);
    const run = makeLayerRunner(ServerDatabase.conversations.layer({ db }));
    const userId = "user-a";
    const conversationId = await run(createConversation({ userId, title: "Running plan" }));
    const [questionId] = await run(
      saveConversationMessages({
        userId,
        conversationId,
        parentId: null,
        messages: [{ role: "user", parts: [{ type: "text", text: "Help with recovery" }] }],
      }),
    );
    const [answerId] = await run(
      saveConversationMessages({
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

    await run(renameConversation({ userId, conversationId, title: "Recovery plan" }));
    await run(
      updateConversationState({ userId, conversationId, status: "archived", pinned: true }),
    );
    assert.deepStrictEqual(
      (await run(getConversations({ userId }))).map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        status: conversation.status,
        pinned: conversation.pinned,
      })),
      [{ id: conversationId, title: "Recovery plan", status: "archived", pinned: true }],
    );
    assert.deepStrictEqual(
      (await run(getConversations({ userId, search: "easy day" }))).map(
        (conversation) => conversation.id,
      ),
      [conversationId],
    );

    const threadId = await run(
      createThread({
        userId,
        conversationId,
        anchorMessageId: questionId,
        title: "Recovery branch",
      }),
    );
    assert.ok(threadId);
    await run(addThreadMessage({ userId, threadId, messageId: answerId }));
    await run(renameThread({ userId, threadId, title: "Recovery details" }));
    await run(pinThread({ userId, threadId, pinned: true }));
    assert.deepStrictEqual(
      (await run(getThreadMessages({ userId, threadId }))).map((message) => message.id),
      [questionId, answerId],
    );
    assert.deepStrictEqual(
      (await run(getThreads({ userId, conversationId }))).map((thread) => ({
        id: thread.id,
        title: thread.title,
        pinned: thread.pinned,
      })),
      [{ id: threadId, title: "Recovery details", pinned: true }],
    );
    assert.strictEqual(
      (await run(getThreadByAnchor({ userId, conversationId, anchorMessageId: questionId })))?.id,
      threadId,
    );

    const summaryId = await run(
      summarizeThread({ userId, threadId, summaryText: "Keep volume low." }),
    );
    assert.ok(summaryId);
    assert.deepStrictEqual(await run(getMessage({ userId, messageId: summaryId })), {
      id: summaryId,
      conversation_id: conversationId,
      parent_id: questionId,
      role: "summary",
      parts: JSON.stringify([{ type: "text", text: "Keep volume low." }]),
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      model: null,
      created_at: (await run(getMessage({ userId, messageId: summaryId })))?.created_at,
    });

    await run(saveSuggestions({ userId, id: "suggestion-key", suggestions: ["Walk", "Sleep"] }));
    await run(saveSuggestions({ userId, id: "suggestion-key", suggestions: ["Ignored"] }));
    assert.deepStrictEqual(
      (await run(getSuggestionsById({ userId, id: "suggestion-key" })))?.suggestions,
      JSON.stringify(["Walk", "Sleep"]),
    );

    await run(discardThread({ userId, threadId }));
    assert.deepStrictEqual(await run(getThreads({ userId, conversationId })), []);
    assert.strictEqual(
      (await run(getThreadsIncludingDiscarded({ userId, conversationId })))[0]?.status,
      "discarded",
    );
    await run(restoreThread({ userId, threadId }));
    assert.strictEqual((await run(getThread({ userId, threadId })))?.status, "regular");

    assert.strictEqual(
      await run(
        reviseConversationMessage({
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
      (await run(getThreadMessages({ userId, threadId }))).map((message) => ({
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
    const run = makeLayerRunner(ServerDatabase.conversations.layer({ db }));
    const userId = "user-a";
    const conversationId = await run(createConversation({ userId, title: "Kept ghost" }));
    await run(
      saveConversationMessages({
        userId,
        conversationId,
        parentId: null,
        messages: [
          { role: "user", parts: [{ type: "text", text: "Ghost note" }] },
          { role: "assistant", parts: [{ type: "text", text: "Ghost reply" }] },
        ],
      }),
    );
    const messages = await run(getConversationMessages({ userId, conversationId }));
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
    const run = makeLayerRunner(ServerDatabase.conversations.layer({ db }));
    const alice = "user-a";
    const bob = "user-b";
    const conversationId = await run(createConversation({ userId: alice, title: "Strength plan" }));
    const [rootId] = await run(
      saveConversationMessages({
        userId: alice,
        conversationId,
        parentId: null,
        messages: [{ role: "user", parts: [{ type: "text", text: "Plan bench" }] }],
      }),
    );
    const [childId] = await run(
      saveConversationMessages({
        userId: alice,
        conversationId,
        parentId: rootId,
        messages: [{ role: "assistant", parts: [{ type: "text", text: "Add five kilos" }] }],
      }),
    );
    const threadId = await run(
      createThread({ userId: alice, conversationId, anchorMessageId: rootId }),
    );
    assert.ok(threadId);
    await run(addThreadMessage({ userId: alice, threadId, messageId: childId }));

    const cloned = await run(cloneConversation({ userId: alice, conversationId }));
    assert.ok(cloned);
    assert.strictEqual(cloned.title, "Strength plan copy");
    const clonedMessages = await run(
      getConversationMessages({ userId: alice, conversationId: cloned.id }),
    );
    const clonedThreads = await run(
      getThreadsIncludingDiscarded({ userId: alice, conversationId: cloned.id }),
    );
    assert.strictEqual(clonedMessages.length, 2);
    assert.strictEqual(clonedMessages[1]?.parent_id, clonedMessages[0]?.id);
    assert.strictEqual(clonedThreads.length, 1);
    assert.deepStrictEqual(
      (await run(getThreadMessages({ userId: alice, threadId: clonedThreads[0]?.id ?? "" })))
        .map((message) => message.id)
        .toSorted(),
      clonedMessages.map((message) => message.id).toSorted(),
    );
    assert.strictEqual(await run(cloneConversation({ userId: bob, conversationId })), null);

    await run(deleteConversation({ userId: bob, conversationId }));
    assert.ok(await run(getConversation({ userId: alice, conversationId })));
    await run(deleteConversation({ userId: alice, conversationId }));
    assert.strictEqual(await run(getConversation({ userId: alice, conversationId })), null);
    assert.ok(await run(getConversation({ userId: alice, conversationId: cloned.id })));
  });
});
