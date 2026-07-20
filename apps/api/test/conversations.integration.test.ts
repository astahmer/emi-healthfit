import assert from "node:assert";
import { describe, it } from "node:test";
import {
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
} from "../src/db/conversations.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";

describe("conversations SQLite integration", () => {
  it("persists conversation, branch, summary, suggestion, and revision lifecycle", async () => {
    const { db } = makeSqliteDatabase();
    const userId = "user-a";
    const conversationId = await run(createConversation(db, userId, "Running plan"));
    const [questionId] = await run(
      saveConversationMessages(db, userId, conversationId, null, [
        { role: "user", parts: [{ type: "text", text: "Help with recovery" }] },
      ]),
    );
    const [answerId] = await run(
      saveConversationMessages(db, userId, conversationId, questionId, [
        {
          role: "assistant",
          parts: [{ type: "text", text: "Take an easy day" }],
          usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
          model: "gpt-5",
        },
      ]),
    );
    assert.ok(questionId);
    assert.ok(answerId);

    await run(renameConversation(db, userId, conversationId, "Recovery plan"));
    await run(
      updateConversationState({ db, userId, conversationId, status: "archived", pinned: true }),
    );
    assert.deepStrictEqual(
      (await run(getConversations(db, userId))).map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        status: conversation.status,
        pinned: conversation.pinned,
      })),
      [{ id: conversationId, title: "Recovery plan", status: "archived", pinned: true }],
    );
    assert.deepStrictEqual(
      (await run(getConversations(db, userId, "easy day"))).map((conversation) => conversation.id),
      [conversationId],
    );

    const threadId = await run(
      createThread(db, userId, conversationId, questionId, "Recovery branch"),
    );
    await run(addThreadMessage(db, userId, threadId, answerId));
    await run(renameThread(db, userId, threadId, "Recovery details"));
    await run(pinThread(db, userId, threadId, true));
    assert.deepStrictEqual(
      (await run(getThreadMessages(db, userId, threadId))).map((message) => message.id),
      [questionId, answerId],
    );
    assert.deepStrictEqual(
      (await run(getThreads(db, userId, conversationId))).map((thread) => ({
        id: thread.id,
        title: thread.title,
        pinned: thread.pinned,
      })),
      [{ id: threadId, title: "Recovery details", pinned: true }],
    );
    assert.strictEqual(
      (await run(getThreadByAnchor(db, userId, conversationId, questionId)))?.id,
      threadId,
    );

    const summaryId = await run(summarizeThread(db, userId, threadId, "Keep volume low."));
    assert.ok(summaryId);
    assert.deepStrictEqual(await run(getMessage(db, userId, summaryId)), {
      id: summaryId,
      conversation_id: conversationId,
      parent_id: questionId,
      role: "summary",
      parts: JSON.stringify([{ type: "text", text: "Keep volume low." }]),
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      model: null,
      created_at: (await run(getMessage(db, userId, summaryId)))?.created_at,
    });

    await run(saveSuggestions(db, userId, "suggestion-key", ["Walk", "Sleep"]));
    await run(saveSuggestions(db, userId, "suggestion-key", ["Ignored"]));
    assert.deepStrictEqual(
      (await run(getSuggestionsById(db, userId, "suggestion-key")))?.suggestions,
      JSON.stringify(["Walk", "Sleep"]),
    );

    await run(discardThread(db, userId, threadId));
    assert.deepStrictEqual(await run(getThreads(db, userId, conversationId)), []);
    assert.strictEqual(
      (await run(getThreadsIncludingDiscarded(db, userId, conversationId)))[0]?.status,
      "discarded",
    );
    await run(restoreThread(db, userId, threadId));
    assert.strictEqual((await run(getThread(db, userId, threadId)))?.status, "regular");

    assert.strictEqual(
      await run(
        reviseConversationMessage({
          db,
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
      (await run(getThreadMessages(db, userId, threadId))).map((message) => ({
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
    const { db } = makeSqliteDatabase();
    const userId = "user-a";
    const conversationId = await run(createConversation(db, userId, "Kept ghost"));
    await run(
      saveConversationMessages(db, userId, conversationId, null, [
        { role: "user", parts: [{ type: "text", text: "Ghost note" }] },
        { role: "assistant", parts: [{ type: "text", text: "Ghost reply" }] },
      ]),
    );
    const messages = await run(getConversationMessages(db, userId, conversationId));
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
    const { db } = makeSqliteDatabase();
    const alice = "user-a";
    const bob = "user-b";
    const conversationId = await run(createConversation(db, alice, "Strength plan"));
    const [rootId] = await run(
      saveConversationMessages(db, alice, conversationId, null, [
        { role: "user", parts: [{ type: "text", text: "Plan bench" }] },
      ]),
    );
    const [childId] = await run(
      saveConversationMessages(db, alice, conversationId, rootId, [
        { role: "assistant", parts: [{ type: "text", text: "Add five kilos" }] },
      ]),
    );
    const threadId = await run(createThread(db, alice, conversationId, rootId));
    await run(addThreadMessage(db, alice, threadId, childId));

    const cloned = await run(cloneConversation({ db, userId: alice, conversationId }));
    assert.ok(cloned);
    assert.strictEqual(cloned.title, "Strength plan copy");
    const clonedMessages = await run(getConversationMessages(db, alice, cloned.id));
    const clonedThreads = await run(getThreadsIncludingDiscarded(db, alice, cloned.id));
    assert.strictEqual(clonedMessages.length, 2);
    assert.strictEqual(clonedMessages[1]?.parent_id, clonedMessages[0]?.id);
    assert.strictEqual(clonedThreads.length, 1);
    assert.deepStrictEqual(
      (await run(getThreadMessages(db, alice, clonedThreads[0]?.id ?? "")))
        .map((message) => message.id)
        .toSorted(),
      clonedMessages.map((message) => message.id).toSorted(),
    );
    assert.strictEqual(await run(cloneConversation({ db, userId: bob, conversationId })), null);

    await run(deleteConversation(db, bob, conversationId));
    assert.ok(await run(getConversation(db, alice, conversationId)));
    await run(deleteConversation(db, alice, conversationId));
    assert.strictEqual(await run(getConversation(db, alice, conversationId)), null);
    assert.ok(await run(getConversation(db, alice, cloned.id)));
  });
});
