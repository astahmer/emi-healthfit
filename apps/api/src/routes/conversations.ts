import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { CurrentUser } from "../auth/request-auth.ts";
import { extractMemories, generateThreadSummary } from "../chat/ai-sdk.ts";
import {
  cloneConversation,
  createConversation,
  createThread,
  deleteConversation,
  discardThread,
  getConversation,
  getConversationMessages,
  getConversations,
  getMessage,
  getThread,
  getThreadMessages,
  getThreads,
  getThreadsIncludingDiscarded,
  pinThread,
  renameConversation,
  renameThread,
  restoreThread,
  summarizeThread,
  updateConversationState,
} from "../db/conversations.ts";
import type { QueryDatabaseClient } from "../db/client.ts";
import { insertMemory } from "../db/memories.ts";

export const handleConversationsList = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const url = new URL(request.url, "http://localhost");
    const search = url.searchParams.get("search") ?? undefined;
    const conversations = yield* getConversations(db, user.id, search);
    return yield* HttpServerResponse.json({ conversations });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleConversationsCreate = (db: QueryDatabaseClient) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const id = yield* createConversation(db, user.id);
    return yield* HttpServerResponse.json({ id }, { status: 201 });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleConversationDelete = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const conversationId = getConversationIdFromPath(request.url);
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid conversation id" }, { status: 400 });
    }

    yield* deleteConversation(db, user.id, conversationId);
    return yield* HttpServerResponse.json({ success: true });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleConversationStateUpdate = (
  db: QueryDatabaseClient,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const conversationId = getConversationIdFromPath(request.url);
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid conversation id" }, { status: 400 });
    }
    const raw = JSON.parse((yield* request.text) || "{}") as unknown;
    const parsed = Schema.decodeUnknownOption(
      Schema.Struct({
        status: Schema.optional(Schema.Literals(["regular", "archived"])),
        pinned: Schema.optional(Schema.Boolean),
      }),
    )(raw);
    if (Option.isNone(parsed)) {
      return yield* HttpServerResponse.json(
        { error: "Invalid conversation state" },
        { status: 400 },
      );
    }
    yield* updateConversationState({ db, userId: user.id, conversationId, ...parsed.value });
    const conversation = yield* getConversation(db, user.id, conversationId);
    return yield* HttpServerResponse.json({ conversation });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleConversationClone = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const conversationId = getConversationIdFromPath(request.url);
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid conversation id" }, { status: 400 });
    }
    const conversation = yield* cloneConversation({ db, userId: user.id, conversationId });
    if (conversation === null) {
      return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    return yield* HttpServerResponse.json({ conversation }, { status: 201 });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const getConversationIdFromPath = (urlOrPath: string): string | undefined => {
  const pathname = new URL(urlOrPath, "http://localhost").pathname;
  return pathname.split("/")[3];
};

const getThreadIdFromPath = (urlOrPath: string): string | undefined => {
  const pathname = new URL(urlOrPath, "http://localhost").pathname;
  return pathname.split("/")[3];
};

const getMessageIdFromPath = (urlOrPath: string): string | undefined => {
  const pathname = new URL(urlOrPath, "http://localhost").pathname;
  return pathname.split("/")[3];
};

const rowToMessage = (row: {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: string;
  parts: string;
  created_at: string;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
}) => ({
  id: row.id,
  conversationId: row.conversation_id,
  parentId: row.parent_id,
  role: row.role,
  parts: JSON.parse(row.parts) as unknown[],
  createdAt: row.created_at,
  model: row.model ?? undefined,
  usage:
    row.prompt_tokens !== null || row.completion_tokens !== null || row.total_tokens !== null
      ? {
          promptTokens: row.prompt_tokens,
          completionTokens: row.completion_tokens,
          totalTokens: row.total_tokens,
        }
      : undefined,
});

export const handleConversationMessages = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const conversationId = getConversationIdFromPath(request.url);
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid conversation id" }, { status: 400 });
    }

    const conversation = yield* getConversation(db, user.id, conversationId);
    if (conversation === null) {
      return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const rows = yield* getConversationMessages(db, user.id, conversationId);
    const threads = yield* getThreadsIncludingDiscarded(db, user.id, conversationId);
    const threadsWithMessages = yield* Effect.forEach(threads, (thread) =>
      getThreadMessages(db, user.id, thread.id).pipe(
        Effect.map((messages) => ({
          ...thread,
          message_ids: messages.map((message) => message.id),
        })),
      ),
    );
    const messages = rows.map(rowToMessage);
    return yield* HttpServerResponse.json({ conversation, messages, threads: threadsWithMessages });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleConversationRename = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const conversationId = getConversationIdFromPath(request.url);
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid conversation id" }, { status: 400 });
    }

    const text = yield* request.text;
    const body = JSON.parse(text || "{}") as { title?: string };
    if (body.title === undefined || body.title.trim() === "") {
      return yield* HttpServerResponse.json({ error: "title is required" }, { status: 400 });
    }

    yield* renameConversation(db, user.id, conversationId, body.title.trim());
    return yield* HttpServerResponse.json({ success: true });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleConversationThreadsList = (
  db: QueryDatabaseClient,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const conversationId = getConversationIdFromPath(request.url);
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid conversation id" }, { status: 400 });
    }

    const threads = yield* getThreads(db, user.id, conversationId);
    return yield* HttpServerResponse.json({ threads });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleConversationThreadsCreate = (
  db: QueryDatabaseClient,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const conversationId = getConversationIdFromPath(request.url);
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid conversation id" }, { status: 400 });
    }

    const text = yield* request.text;
    const body = JSON.parse(text || "{}") as { anchorMessageId?: string; title?: string };
    if (body.anchorMessageId === undefined || body.anchorMessageId.trim() === "") {
      return yield* HttpServerResponse.json(
        { error: "anchorMessageId is required" },
        { status: 400 },
      );
    }

    const anchor = yield* getMessage(db, user.id, body.anchorMessageId.trim());
    if (anchor === null || anchor.conversation_id !== conversationId) {
      return yield* HttpServerResponse.json({ error: "Anchor message not found" }, { status: 404 });
    }

    const id = yield* createThread(
      db,
      user.id,
      conversationId,
      body.anchorMessageId.trim(),
      body.title?.trim(),
    );
    const thread = yield* getThread(db, user.id, id);
    return yield* HttpServerResponse.json(
      thread === null ? null : { ...thread, message_ids: [thread.anchor_message_id] },
      { status: 201 },
    );
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleThreadRead = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const threadId = getThreadIdFromPath(request.url);
    if (threadId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid thread id" }, { status: 400 });
    }

    const thread = yield* getThread(db, user.id, threadId);
    if (thread === null) {
      return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const rows = yield* getThreadMessages(db, user.id, threadId);
    const messages = rows.map(rowToMessage);
    return yield* HttpServerResponse.json({ thread, messages });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleThreadUpdate = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const threadId = getThreadIdFromPath(request.url);
    if (threadId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid thread id" }, { status: 400 });
    }

    const text = yield* request.text;
    const body = JSON.parse(text || "{}") as {
      title?: string;
      pinned?: boolean;
      status?: string;
    };

    if (body.title !== undefined && body.title.trim() !== "") {
      yield* renameThread(db, user.id, threadId, body.title.trim());
    }

    if (body.pinned !== undefined) {
      yield* pinThread(db, user.id, threadId, body.pinned);
    }

    if (body.status === "discarded") {
      yield* discardThread(db, user.id, threadId);
    }

    if (body.status === "regular") {
      yield* restoreThread(db, user.id, threadId);
    }

    return yield* HttpServerResponse.json({ success: true });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleThreadSummarize = (
  db: QueryDatabaseClient,
  env: Record<string, unknown>,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const threadId = getThreadIdFromPath(request.url);
    if (threadId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid thread id" }, { status: 400 });
    }

    const thread = yield* getThread(db, user.id, threadId);
    if (thread === null) {
      return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const rows = yield* getThreadMessages(db, user.id, threadId);
    const messages = rows
      .filter((row) => row.role !== "summary")
      .map((row) => ({
        role: row.role,
        text: (JSON.parse(row.parts) as Array<{ type?: string; text?: string }>)
          .filter((part) => part.type === "text" && typeof part.text === "string")
          .map((part) => part.text)
          .join("\n"),
      }))
      .filter((message) => message.text.trim() !== "");

    const apiKey = env.OPENAI_API_KEY !== undefined ? String(env.OPENAI_API_KEY) : "";
    const summaryText =
      apiKey === "" || messages.length === 0
        ? "No summary available."
        : yield* Effect.promise(() => generateThreadSummary(apiKey, undefined, messages));

    const summaryId = yield* summarizeThread(db, user.id, threadId, summaryText);
    return yield* HttpServerResponse.json({ id: summaryId, summary: summaryText });
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    ),
  );

export const handleMessageRead = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const messageId = getMessageIdFromPath(request.url);
    if (messageId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid message id" }, { status: 400 });
    }

    const message = yield* getMessage(db, user.id, messageId);
    if (message === null) {
      return yield* HttpServerResponse.json({ error: "Message not found" }, { status: 404 });
    }

    return yield* HttpServerResponse.json({ message: rowToMessage(message) });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleMemoryExtract = (
  db: QueryDatabaseClient,
  env: Record<string, unknown>,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const requestText = yield* request.text;
    const body = JSON.parse(requestText || "{}") as { text?: string; threadId?: string };
    if (body.text === undefined || body.text.trim() === "") {
      return yield* HttpServerResponse.json({ error: "text is required" }, { status: 400 });
    }
    const text = body.text;

    const apiKey = env.OPENAI_API_KEY !== undefined ? String(env.OPENAI_API_KEY) : "";
    if (apiKey === "") {
      return yield* HttpServerResponse.json(
        { error: "OpenAI API key is required" },
        { status: 400 },
      );
    }

    const baseUrl = env.OPENAI_BASE_URL !== undefined ? String(env.OPENAI_BASE_URL) : undefined;
    const snippets = yield* Effect.promise(() => extractMemories(apiKey, baseUrl, text));
    const ids: string[] = [];
    for (const snippet of snippets) {
      const id = yield* insertMemory(db, user.id, snippet, "assistant", body.threadId);
      if (id !== null) ids.push(id);
    }
    return yield* HttpServerResponse.json({ ids, count: ids.length });
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    ),
  );
