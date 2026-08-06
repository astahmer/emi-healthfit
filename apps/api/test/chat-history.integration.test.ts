import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { prepareChatHistory } from "../src/chat/history.ts";
import { ServerDatabase } from "@emi/core/server/database";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";
import { makeFakeBucket } from "./fake-bucket.ts";

describe("chat history SQLite integration", () => {
  const { bucket } = makeFakeBucket();
  const summaryProviderResponse = async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(init?.body ?? "").includes('"stream":true'), false);
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: { content: "Compacted workout context", role: "assistant" },
          },
        ],
        created: 1,
        id: "summary-generation",
        model: "test-model",
        object: "chat.completion",
        usage: { completion_tokens: 10, prompt_tokens: 10, total_tokens: 20 },
      }),
      { headers: { "content-type": "application/json" } },
    );
  };

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
        bucket,
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
        bucket,
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
        bucket,
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

  it("replaces over-budget history with a summary row and summary-only provider context", async () => {
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
            parts: [{ type: "text", text: "Tell me about recovery" }],
            usage: { prompt_tokens: 2000, completion_tokens: 0, total_tokens: 2000 },
          },
          {
            role: "assistant",
            parts: [{ type: "text", text: "Recovery advice" }],
            usage: { prompt_tokens: 2100, completion_tokens: 900, total_tokens: 3000 },
          },
        ],
      }),
    );

    const previousFetch = globalThis.fetch;
    globalThis.fetch = summaryProviderResponse as typeof fetch;
    try {
      const history = await run(
        prepareChatHistory({
          userId,
          sessionId: conversationId,
          isTemporary: false,
          bucket,
          chatRequest: {
            messages: [
              { id: "incoming-1", role: "user", parts: [{ type: "text", text: "More questions" }] },
            ],
            config: { provider: "openai", apiKey: "key", model: "gpt-5" },
            tokenBudget: 4000,
          },
        }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
      );

      assert.equal("error" in history, false);
      if ("error" in history) return;
      assert.equal(history.compacted, true);
      assert.deepEqual(
        history.requestWithHistory.messages.map((message) => message.role),
        ["system", "user"],
      );
      const firstPart = history.requestWithHistory.messages[0]?.parts[0];
      const summaryText =
        firstPart !== undefined && "text" in firstPart ? String(firstPart.text) : "";
      assert.match(summaryText, /Compacted workout context/);
      const rows = await run(
        conversationDatabase.getConversationMessages({ userId, conversationId }),
      );
      assert.equal(rows.filter((row) => row.role === "summary").length, 1);
      assert.equal(rows.length, 4);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("leaves history untouched when the send stays under the token budget", async () => {
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
            role: "assistant",
            parts: [{ type: "text", text: "Short reply" }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
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
          messages: [{ id: "incoming-2", role: "user", parts: [{ type: "text", text: "Hi" }] }],
          config: { provider: "openai", apiKey: "key", model: "gpt-5" },
          tokenBudget: 10000,
        },
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );

    assert.equal("error" in history, false);
    if ("error" in history) return;
    assert.equal(history.compacted, false);
    assert.deepEqual(
      history.requestWithHistory.messages.map((message) => message.role),
      ["assistant", "user"],
    );
    const rows = await run(
      conversationDatabase.getConversationMessages({ userId, conversationId }),
    );
    assert.equal(rows.filter((row) => row.role === "summary").length, 0);
  });

  it("treats a zero token budget as disabled", async () => {
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
            role: "assistant",
            parts: [{ type: "text", text: "Expensive reply" }],
            usage: { prompt_tokens: 5000, completion_tokens: 5000, total_tokens: 10000 },
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
          messages: [{ id: "incoming-3", role: "user", parts: [{ type: "text", text: "Hi" }] }],
          config: { provider: "openai", apiKey: "key", model: "gpt-5" },
          tokenBudget: 0,
        },
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );

    assert.equal("error" in history, false);
    if ("error" in history) return;
    assert.equal(history.compacted, false);
    assert.deepEqual(
      history.requestWithHistory.messages.map((message) => message.role),
      ["assistant", "user"],
    );
  });

  it("stacks repeated compactions on the latest summary", async () => {
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
            parts: [{ type: "text", text: "First question" }],
            usage: { prompt_tokens: 2000, completion_tokens: 0, total_tokens: 2000 },
          },
          {
            role: "assistant",
            parts: [{ type: "text", text: "First answer" }],
            usage: { prompt_tokens: 2100, completion_tokens: 900, total_tokens: 3000 },
          },
        ],
      }),
    );

    const previousFetch = globalThis.fetch;
    globalThis.fetch = summaryProviderResponse as typeof fetch;
    try {
      const first = await run(
        prepareChatHistory({
          userId,
          sessionId: conversationId,
          isTemporary: false,
          bucket,
          chatRequest: {
            messages: [
              { id: "incoming-4", role: "user", parts: [{ type: "text", text: "Follow up" }] },
            ],
            config: { provider: "openai", apiKey: "key", model: "gpt-5" },
            tokenBudget: 4000,
          },
        }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
      );
      assert.equal("error" in first, false);
      if ("error" in first) return;
      assert.equal(first.compacted, true);
      await run(
        conversationDatabase.saveConversationMessages({
          userId,
          conversationId,
          parentId: "incoming-4",
          messages: [
            {
              role: "assistant",
              parts: [{ type: "text", text: "First follow-up answer" }],
              usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
            },
          ],
        }),
      );

      const second = await run(
        prepareChatHistory({
          userId,
          sessionId: conversationId,
          isTemporary: false,
          bucket,
          chatRequest: {
            messages: [
              { id: "incoming-5", role: "user", parts: [{ type: "text", text: "One more" }] },
            ],
            config: { provider: "openai", apiKey: "key", model: "gpt-5" },
            tokenBudget: 1,
          },
        }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
      );
      assert.equal("error" in second, false);
      if ("error" in second) return;
      assert.equal(second.compacted, true);
      assert.deepEqual(
        second.requestWithHistory.messages.map((message) => message.role),
        ["system", "user"],
      );

      const rows = await run(
        conversationDatabase.getConversationMessages({ userId, conversationId }),
      );
      assert.equal(rows.filter((row) => row.role === "summary").length, 2);
      const latestSummary = rows.filter((row) => row.role === "summary").at(-1);
      assert.match(String(latestSummary?.parts ?? ""), /Compacted workout context/);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("collapses pre-marker rows for a thread anchored before the compaction", async () => {
    const { db: rawDb } = makeSqliteDatabase();
    const db = narrowQueryDatabaseClient<ServerDatabase.ConversationDatabaseSchema>(rawDb);
    const conversationDatabase = await run(
      Effect.gen(function* () {
        return yield* ServerDatabase.conversations;
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );
    const userId = "user-a";
    const conversationId = await run(conversationDatabase.createConversation({ userId }));
    const [userMessageId] = await run(
      conversationDatabase.saveConversationMessages({
        userId,
        conversationId,
        parentId: null,
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "Root question" }],
            usage: { prompt_tokens: 2000, completion_tokens: 0, total_tokens: 2000 },
          },
        ],
      }),
    );
    const threadId = await run(
      conversationDatabase.createThread({
        userId,
        conversationId,
        anchorMessageId: userMessageId ?? "",
        title: "Branch",
      }),
    );
    if (threadId === null) throw new Error("Expected a thread");
    const [branchMessageId] = await run(
      conversationDatabase.saveConversationMessages({
        userId,
        conversationId,
        parentId: userMessageId ?? null,
        messages: [
          {
            role: "assistant",
            parts: [{ type: "text", text: "Branch answer" }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          },
        ],
      }),
    );
    if (branchMessageId !== undefined) {
      await run(
        conversationDatabase.addThreadMessage({
          userId,
          threadId,
          messageId: branchMessageId,
        }),
      );
    }

    const previousFetch = globalThis.fetch;
    globalThis.fetch = summaryProviderResponse as typeof fetch;
    try {
      const history = await run(
        prepareChatHistory({
          userId,
          sessionId: conversationId,
          isTemporary: false,
          bucket,
          chatRequest: {
            messages: [
              {
                id: "incoming-6",
                role: "user",
                parts: [{ type: "text", text: "Branch follow up" }],
              },
            ],
            config: { provider: "openai", apiKey: "key", model: "gpt-5" },
            threadId,
            tokenBudget: 1500,
          },
        }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
      );

      assert.equal("error" in history, false);
      if ("error" in history) return;
      assert.equal(history.compacted, true);
      assert.deepEqual(
        history.requestWithHistory.messages.map((message) => message.role),
        ["system", "assistant", "user"],
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("proceeds without compacting when summary generation fails", async () => {
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
            role: "assistant",
            parts: [{ type: "text", text: "Expensive reply" }],
            usage: { prompt_tokens: 5000, completion_tokens: 5000, total_tokens: 10000 },
          },
        ],
      }),
    );

    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("provider unavailable");
    }) as typeof fetch;
    try {
      const history = await run(
        prepareChatHistory({
          userId,
          sessionId: conversationId,
          isTemporary: false,
          bucket,
          chatRequest: {
            messages: [{ id: "incoming-7", role: "user", parts: [{ type: "text", text: "More" }] }],
            config: { provider: "openai", apiKey: "key", model: "gpt-5" },
            tokenBudget: 1,
          },
        }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
      );

      assert.equal("error" in history, false);
      if ("error" in history) return;
      assert.equal(history.compacted, false);
      assert.deepEqual(
        history.requestWithHistory.messages.map((message) => message.role),
        ["assistant", "user"],
      );
      const rows = await run(
        conversationDatabase.getConversationMessages({ userId, conversationId }),
      );
      assert.equal(rows.filter((row) => row.role === "summary").length, 0);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("does not compact when the stored usage plus the incoming message sits exactly on the budget", async () => {
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
            role: "assistant",
            parts: [{ type: "text", text: "Fourteen character text" }],
            usage: { prompt_tokens: 100, completion_tokens: 0, total_tokens: 100 },
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
          messages: [
            // 8 characters -> 2 estimated tokens, stored 100 + 2 = 102 <= 102
            { id: "incoming-8", role: "user", parts: [{ type: "text", text: "12345678" }] },
          ],
          config: { provider: "openai", apiKey: "key", model: "gpt-5" },
          tokenBudget: 102,
        },
      }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
    );

    assert.equal("error" in history, false);
    if ("error" in history) return;
    assert.equal(history.compacted, false);
    const rows = await run(
      conversationDatabase.getConversationMessages({ userId, conversationId }),
    );
    assert.equal(rows.filter((row) => row.role === "summary").length, 0);
  });

  it("compacts as soon as the stored usage plus the incoming message exceeds the budget", async () => {
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
            role: "assistant",
            parts: [{ type: "text", text: "Fourteen character text" }],
            usage: { prompt_tokens: 100, completion_tokens: 0, total_tokens: 100 },
          },
        ],
      }),
    );

    const previousFetch = globalThis.fetch;
    globalThis.fetch = summaryProviderResponse as typeof fetch;
    try {
      const history = await run(
        prepareChatHistory({
          userId,
          sessionId: conversationId,
          isTemporary: false,
          bucket,
          chatRequest: {
            messages: [
              // 9 characters -> 3 estimated tokens, stored 100 + 3 = 103 > 102
              { id: "incoming-9", role: "user", parts: [{ type: "text", text: "123456789" }] },
            ],
            config: { provider: "openai", apiKey: "key", model: "gpt-5" },
            tokenBudget: 102,
          },
        }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
      );

      assert.equal("error" in history, false);
      if ("error" in history) return;
      assert.equal(history.compacted, true);
      const rows = await run(
        conversationDatabase.getConversationMessages({ userId, conversationId }),
      );
      assert.equal(rows.filter((row) => row.role === "summary").length, 1);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("falls back to a text estimate when stored usage tokens are missing", async () => {
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
            role: "assistant",
            // 200 characters -> 50 estimated tokens
            parts: [{ type: "text", text: "x".repeat(200) }],
          },
        ],
      }),
    );

    const previousFetch = globalThis.fetch;
    globalThis.fetch = summaryProviderResponse as typeof fetch;
    try {
      const history = await run(
        prepareChatHistory({
          userId,
          sessionId: conversationId,
          isTemporary: false,
          bucket,
          chatRequest: {
            messages: [{ id: "incoming-10", role: "user", parts: [{ type: "text", text: "Hi" }] }],
            config: { provider: "openai", apiKey: "key", model: "gpt-5" },
            tokenBudget: 50,
          },
        }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
      );

      assert.equal("error" in history, false);
      if ("error" in history) return;
      assert.equal(history.compacted, true);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("never compacts a conversation that only contains summary rows", async () => {
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
            role: "summary",
            parts: [
              {
                type: "text",
                text: "Use this compacted summary of the previous conversation as context:\nNotes",
              },
            ],
          },
        ],
      }),
    );

    const previousFetch = globalThis.fetch;
    globalThis.fetch = summaryProviderResponse as typeof fetch;
    try {
      const history = await run(
        prepareChatHistory({
          userId,
          sessionId: conversationId,
          isTemporary: false,
          bucket,
          chatRequest: {
            messages: [{ id: "incoming-11", role: "user", parts: [{ type: "text", text: "Hi" }] }],
            config: { provider: "openai", apiKey: "key", model: "gpt-5" },
            tokenBudget: 1,
          },
        }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
      );

      assert.equal("error" in history, false);
      if ("error" in history) return;
      assert.equal(history.compacted, false);
      assert.deepEqual(
        history.requestWithHistory.messages.map((message) => message.role),
        ["system", "user"],
      );
      const rows = await run(
        conversationDatabase.getConversationMessages({ userId, conversationId }),
      );
      assert.equal(rows.filter((row) => row.role === "summary").length, 1);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("keeps a thread anchored after the compaction marker in full context", async () => {
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
            parts: [{ type: "text", text: "Root question" }],
            usage: { prompt_tokens: 2000, completion_tokens: 0, total_tokens: 2000 },
          },
        ],
      }),
    );
    const previousFetch = globalThis.fetch;
    globalThis.fetch = summaryProviderResponse as typeof fetch;
    try {
      const first = await run(
        prepareChatHistory({
          userId,
          sessionId: conversationId,
          isTemporary: false,
          bucket,
          chatRequest: {
            messages: [
              { id: "incoming-12", role: "user", parts: [{ type: "text", text: "Compress me" }] },
            ],
            config: { provider: "openai", apiKey: "key", model: "gpt-5" },
            tokenBudget: 2000,
          },
        }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
      );
      assert.equal("error" in first, false);
      if ("error" in first) return;
      assert.equal(first.compacted, true);

      const threadId = await run(
        conversationDatabase.createThread({
          userId,
          conversationId,
          anchorMessageId: "incoming-12",
          title: "Post-compaction branch",
        }),
      );
      if (threadId === null) throw new Error("Expected a thread");
      const [branchMessageId] = await run(
        conversationDatabase.saveConversationMessages({
          userId,
          conversationId,
          parentId: "incoming-12",
          messages: [
            {
              role: "assistant",
              parts: [{ type: "text", text: "Branch after compaction" }],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            },
          ],
        }),
      );
      if (branchMessageId !== undefined) {
        await run(
          conversationDatabase.addThreadMessage({
            userId,
            threadId,
            messageId: branchMessageId,
          }),
        );
      }
      console.log(
        "DEBUG rows before second:",
        JSON.stringify(
          (await run(conversationDatabase.getConversationMessages({ userId, conversationId }))).map(
            (row) => ({ id: row.id, role: row.role, created_at: row.created_at }),
          ),
        ),
      );

      const second = await run(
        prepareChatHistory({
          userId,
          sessionId: conversationId,
          isTemporary: false,
          bucket,
          chatRequest: {
            messages: [
              {
                id: "incoming-13",
                role: "user",
                parts: [{ type: "text", text: "Branch follow up" }],
              },
            ],
            config: { provider: "openai", apiKey: "key", model: "gpt-5" },
            threadId,
            tokenBudget: 1000,
          },
        }).pipe(Effect.provide(ServerDatabase.conversations.layer({ db }))),
      );

      assert.equal("error" in second, false);
      if ("error" in second) return;
      assert.deepEqual(
        second.requestWithHistory.messages.map((message) => message.role),
        ["system", "user", "assistant", "user"],
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
