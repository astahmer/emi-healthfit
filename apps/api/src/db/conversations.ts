import * as Effect from "effect/Effect";
import { getRevisionDeletionIds } from "../chat/conversation-revision.ts";
import type { SuggestionsRow } from "./schema.ts";
import { runBatches, type QueryDatabaseClient } from "./client.ts";

const textEncoder = new TextEncoder();

const arrayBufferToHex = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const requireMappedId = (ids: Map<string, string>, originalId: string): string => {
  const id = ids.get(originalId);
  if (id === undefined) throw new Error(`Missing cloned id for ${originalId}`);
  return id;
};

export const hashSuggestionsKey = (
  lastAssistantText: string,
  lastUserText?: string,
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const input = `${lastAssistantText}\0${lastUserText ?? ""}`;
    const buffer = yield* Effect.promise(() =>
      crypto.subtle.digest("SHA-256", textEncoder.encode(input)),
    );
    return arrayBufferToHex(buffer);
  });

export interface Conversation {
  id: string;
  title: string | null;
  status: "regular" | "archived";
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

interface ConversationRow {
  id: string;
  title: string | null;
  status: Conversation["status"];
  pinned: number;
  created_at: string;
  updated_at: string;
}

const mapConversationRow = (row: ConversationRow): Conversation => ({
  id: row.id,
  title: row.title,
  status: row.status,
  pinned: row.pinned === 1,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export interface MessageUsage {
  prompt_tokens?: number | undefined;
  completion_tokens?: number | undefined;
  total_tokens?: number | undefined;
}

export interface Message {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: string;
  parts: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  model: string | null;
  created_at: string;
}

export interface Thread {
  id: string;
  conversation_id: string;
  anchor_message_id: string;
  title: string | null;
  status: "regular" | "discarded" | "merged";
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

const nowIso = (): string => new Date().toISOString();

export const createConversation = (db: QueryDatabaseClient, userId: string, title?: string) =>
  Effect.gen(function* () {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    yield* db
      .prepare(`
      INSERT INTO conversations (id, user_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
      .bind(id, userId, title ?? null, "regular", createdAt, createdAt)
      .run();
    return id;
  });

export const getConversations = (db: QueryDatabaseClient, userId: string, search?: string) =>
  Effect.gen(function* () {
    if (search !== undefined && search.trim() !== "") {
      const term = `%${search.trim()}%`;
      const result = yield* db
        .prepare(`
        SELECT DISTINCT c.*
        FROM conversations c
        LEFT JOIN messages m ON m.user_id = c.user_id AND m.conversation_id = c.id
        WHERE c.user_id = ? AND c.status IN ('regular', 'archived') AND (c.title LIKE ? OR m.parts LIKE ?)
        ORDER BY c.status = 'archived', c.pinned DESC, c.updated_at DESC
        LIMIT 100
      `)
        .bind(userId, term, term)
        .all<ConversationRow>();
      return result.results.map(mapConversationRow);
    }

    const result = yield* db
      .prepare(`
      SELECT * FROM conversations
      WHERE user_id = ? AND status IN ('regular', 'archived')
      ORDER BY status = 'archived', pinned DESC, updated_at DESC
      LIMIT 100
    `)
      .bind(userId)
      .all<ConversationRow>();
    return result.results.map(mapConversationRow);
  });

export const getConversation = (db: QueryDatabaseClient, userId: string, conversationId: string) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT * FROM conversations WHERE user_id = ? AND id = ?
    `)
      .bind(userId, conversationId)
      .first<ConversationRow>();
    return result === null ? null : mapConversationRow(result);
  });

export const deleteConversation = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`DELETE FROM conversations WHERE user_id = ? AND id = ?`)
      .bind(userId, conversationId)
      .run();
  });

export const updateConversationState = Effect.fn("conversation.updateState")(function* ({
  db,
  userId,
  conversationId,
  status,
  pinned,
}: {
  db: QueryDatabaseClient;
  userId: string;
  conversationId: string;
  status?: "regular" | "archived";
  pinned?: boolean;
}) {
  if (status !== undefined) {
    yield* db
      .prepare("UPDATE conversations SET status = ?, updated_at = ? WHERE user_id = ? AND id = ?")
      .bind(status, nowIso(), userId, conversationId)
      .run();
  }
  if (pinned !== undefined) {
    yield* db
      .prepare("UPDATE conversations SET pinned = ?, updated_at = ? WHERE user_id = ? AND id = ?")
      .bind(pinned ? 1 : 0, nowIso(), userId, conversationId)
      .run();
  }
});

export const cloneConversation = Effect.fn("conversation.clone")(function* ({
  db,
  userId,
  conversationId,
}: {
  db: QueryDatabaseClient;
  userId: string;
  conversationId: string;
}) {
  const conversation = yield* getConversation(db, userId, conversationId);
  if (conversation === null) return null;
  const originalMessages = yield* getConversationMessages(db, userId, conversationId);
  const originalThreads = yield* getThreadsIncludingDiscarded(db, userId, conversationId);
  const threadMessageRows = yield* db
    .prepare(
      "SELECT tm.thread_id, tm.message_id, tm.included_at FROM thread_messages tm JOIN threads t ON t.user_id = tm.user_id AND t.id = tm.thread_id WHERE tm.user_id = ? AND t.conversation_id = ?",
    )
    .bind(userId, conversationId)
    .all<{ thread_id: string; message_id: string; included_at: string }>();
  const clonedConversationId = crypto.randomUUID();
  const timestamp = nowIso();
  const messageIds = new Map(originalMessages.map((message) => [message.id, crypto.randomUUID()]));
  const threadIds = new Map(originalThreads.map((thread) => [thread.id, crypto.randomUUID()]));

  yield* db
    .prepare(
      "INSERT INTO conversations (id, user_id, title, status, pinned, created_at, updated_at) VALUES (?, ?, ?, 'regular', 0, ?, ?)",
    )
    .bind(
      clonedConversationId,
      userId,
      `${conversation.title ?? "New chat"} copy`,
      timestamp,
      timestamp,
    )
    .run();
  yield* runBatches(
    db,
    originalMessages.map((message) =>
      db
        .prepare(
          "INSERT INTO messages (id, user_id, conversation_id, parent_id, role, parts, prompt_tokens, completion_tokens, total_tokens, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          requireMappedId(messageIds, message.id),
          userId,
          clonedConversationId,
          message.parent_id === null ? null : (messageIds.get(message.parent_id) ?? null),
          message.role,
          message.parts,
          message.prompt_tokens,
          message.completion_tokens,
          message.total_tokens,
          message.model,
          message.created_at,
        ),
    ),
  );
  yield* runBatches(
    db,
    originalThreads.map((thread) =>
      db
        .prepare(
          "INSERT INTO threads (id, user_id, conversation_id, anchor_message_id, title, status, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          requireMappedId(threadIds, thread.id),
          userId,
          clonedConversationId,
          requireMappedId(messageIds, thread.anchor_message_id),
          thread.title,
          thread.status,
          thread.pinned ? 1 : 0,
          thread.created_at,
          thread.updated_at,
        ),
    ),
  );
  yield* runBatches(
    db,
    threadMessageRows.results.flatMap((row) => {
      const threadId = threadIds.get(row.thread_id);
      const messageId = messageIds.get(row.message_id);
      if (threadId === undefined || messageId === undefined) return [];
      return [
        db
          .prepare(
            "INSERT INTO thread_messages (user_id, thread_id, message_id, included_at) VALUES (?, ?, ?, ?)",
          )
          .bind(userId, threadId, messageId, row.included_at),
      ];
    }),
  );
  return yield* getConversation(db, userId, clonedConversationId);
});

export const renameConversation = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
  title: string,
) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`
      UPDATE conversations SET title = ?, updated_at = ? WHERE user_id = ? AND id = ?
    `)
      .bind(title, nowIso(), userId, conversationId)
      .run();
  });

const updateConversationTimestamp = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`
      UPDATE conversations SET updated_at = ? WHERE user_id = ? AND id = ?
    `)
      .bind(nowIso(), userId, conversationId)
      .run();
  });

export const getConversationMessages = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT id, conversation_id, parent_id, role, parts, prompt_tokens, completion_tokens, total_tokens, model, created_at
      FROM messages
      WHERE user_id = ? AND conversation_id = ?
      ORDER BY created_at ASC
    `)
      .bind(userId, conversationId)
      .all<Message>();
    return result.results;
  });

export const reviseConversationMessage = Effect.fn("conversation.reviseMessage")(function* ({
  db,
  userId,
  conversationId,
  messageId,
  parts,
  threadId,
}: {
  db: QueryDatabaseClient;
  userId: string;
  conversationId: string;
  messageId: string;
  parts: unknown[];
  threadId?: string;
}) {
  const conversationRows = yield* getConversationMessages(db, userId, conversationId);
  const message = conversationRows.find((row) => row.id === messageId);
  if (message === undefined || message.role !== "user") return false;

  const scopedRows =
    threadId === undefined
      ? conversationRows.filter((row) => row.parent_id === null)
      : yield* getThreadMessages(db, userId, threadId);
  const messageIndex = scopedRows.findIndex((row) => row.id === messageId);
  if (messageIndex < 0) return false;

  const deletedMessageIds = getRevisionDeletionIds({
    conversationRows,
    scopedRows,
    messageId,
    includeDescendants: threadId === undefined,
  });

  const statements = [
    db
      .prepare(
        "UPDATE messages SET parts = ?, prompt_tokens = NULL, completion_tokens = NULL, total_tokens = NULL, model = NULL WHERE user_id = ? AND id = ? AND conversation_id = ?",
      )
      .bind(JSON.stringify(parts), userId, messageId, conversationId),
    ...deletedMessageIds.map((deletedMessageId) =>
      db
        .prepare("DELETE FROM messages WHERE user_id = ? AND id = ?")
        .bind(userId, deletedMessageId),
    ),
  ];
  yield* runBatches(db, statements);
  yield* updateConversationTimestamp(db, userId, conversationId);
  return true;
});

export const saveConversationMessages = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
  parentId: string | null,
  messages: Array<{ role: string; parts: unknown[]; usage?: MessageUsage; model?: string }>,
) =>
  Effect.gen(function* () {
    if (messages.length === 0) return [];

    const createdAt = nowIso();
    const ids: string[] = [];
    const statements = messages.map((message) => {
      const id = crypto.randomUUID();
      ids.push(id);
      return db
        .prepare(`
        INSERT INTO messages (id, user_id, conversation_id, parent_id, role, parts, prompt_tokens, completion_tokens, total_tokens, model, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          id,
          userId,
          conversationId,
          parentId,
          message.role,
          JSON.stringify(message.parts),
          message.usage?.prompt_tokens ?? null,
          message.usage?.completion_tokens ?? null,
          message.usage?.total_tokens ?? null,
          message.model ?? null,
          createdAt,
        );
    });

    yield* runBatches(db, statements);
    yield* updateConversationTimestamp(db, userId, conversationId);
    return ids;
  });

export const createThread = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
  anchorMessageId: string,
  title?: string,
) =>
  Effect.gen(function* () {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    yield* db
      .prepare(`
      INSERT INTO threads (id, user_id, conversation_id, anchor_message_id, title, status, pinned, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        id,
        userId,
        conversationId,
        anchorMessageId,
        title ?? null,
        "regular",
        0,
        createdAt,
        createdAt,
      )
      .run();
    yield* addThreadMessage(db, userId, id, anchorMessageId);
    return id;
  });

interface ThreadRow {
  id: string;
  conversation_id: string;
  anchor_message_id: string;
  title: string | null;
  status: Thread["status"];
  pinned: number;
  created_at: string;
  updated_at: string;
}

const mapThreadRow = (row: ThreadRow): Thread => ({
  id: row.id,
  conversation_id: row.conversation_id,
  anchor_message_id: row.anchor_message_id,
  title: row.title,
  status: row.status,
  pinned: row.pinned === 1,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const getThreads = (db: QueryDatabaseClient, userId: string, conversationId: string) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT * FROM threads
      WHERE user_id = ? AND conversation_id = ? AND status != 'discarded'
      ORDER BY pinned DESC, updated_at DESC
    `)
      .bind(userId, conversationId)
      .all<ThreadRow>();
    return result.results.map(mapThreadRow);
  });

export const getThreadsIncludingDiscarded = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT * FROM threads
      WHERE user_id = ? AND conversation_id = ?
      ORDER BY pinned DESC, updated_at DESC
    `)
      .bind(userId, conversationId)
      .all<ThreadRow>();
    return result.results.map(mapThreadRow);
  });

export const getThread = (db: QueryDatabaseClient, userId: string, threadId: string) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT * FROM threads WHERE user_id = ? AND id = ?
    `)
      .bind(userId, threadId)
      .first<ThreadRow>();
    return result === null ? null : mapThreadRow(result);
  });

export const renameThread = (
  db: QueryDatabaseClient,
  userId: string,
  threadId: string,
  title: string,
) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`
      UPDATE threads SET title = ?, updated_at = ? WHERE user_id = ? AND id = ?
    `)
      .bind(title, nowIso(), userId, threadId)
      .run();
  });

export const pinThread = (
  db: QueryDatabaseClient,
  userId: string,
  threadId: string,
  pinned: boolean,
) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`
      UPDATE threads SET pinned = ?, updated_at = ? WHERE user_id = ? AND id = ?
    `)
      .bind(pinned ? 1 : 0, nowIso(), userId, threadId)
      .run();
  });

export const discardThread = (db: QueryDatabaseClient, userId: string, threadId: string) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`
      UPDATE threads SET status = 'discarded', updated_at = ? WHERE user_id = ? AND id = ?
    `)
      .bind(nowIso(), userId, threadId)
      .run();
  });

export const restoreThread = (db: QueryDatabaseClient, userId: string, threadId: string) =>
  Effect.gen(function* () {
    yield* db
      .prepare("UPDATE threads SET status = 'regular', updated_at = ? WHERE user_id = ? AND id = ?")
      .bind(nowIso(), userId, threadId)
      .run();
  });

export const addThreadMessage = (
  db: QueryDatabaseClient,
  userId: string,
  threadId: string,
  messageId: string,
) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`
      INSERT INTO thread_messages (user_id, thread_id, message_id, included_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, thread_id, message_id) DO NOTHING
    `)
      .bind(userId, threadId, messageId, nowIso())
      .run();
  });

export const getThreadMessages = (db: QueryDatabaseClient, userId: string, threadId: string) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT m.id, m.conversation_id, m.parent_id, m.role, m.parts, m.prompt_tokens, m.completion_tokens, m.total_tokens, m.model, m.created_at
      FROM messages m
      JOIN thread_messages tm ON tm.user_id = m.user_id AND tm.message_id = m.id
      WHERE tm.user_id = ? AND tm.thread_id = ?
      ORDER BY m.created_at ASC
    `)
      .bind(userId, threadId)
      .all<Message>();
    return result.results;
  });

export const getMessage = (db: QueryDatabaseClient, userId: string, messageId: string) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT id, conversation_id, parent_id, role, parts, prompt_tokens, completion_tokens, total_tokens, model, created_at
      FROM messages WHERE user_id = ? AND id = ?
    `)
      .bind(userId, messageId)
      .first<Message>();
    return result ?? null;
  });

export const summarizeThread = (
  db: QueryDatabaseClient,
  userId: string,
  threadId: string,
  summaryText: string,
  targetMessageId?: string,
) =>
  Effect.gen(function* () {
    const thread = yield* getThread(db, userId, threadId);
    if (thread === null) return null;

    const id = crypto.randomUUID();
    const createdAt = nowIso();
    yield* db
      .prepare(`
      INSERT INTO messages (id, user_id, conversation_id, parent_id, role, parts, prompt_tokens, completion_tokens, total_tokens, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        id,
        userId,
        thread.conversation_id,
        targetMessageId ?? thread.anchor_message_id,
        "summary",
        JSON.stringify([{ type: "text", text: summaryText }]),
        null,
        null,
        null,
        null,
        createdAt,
      )
      .run();
    yield* addThreadMessage(db, userId, threadId, id);
    yield* updateConversationTimestamp(db, userId, thread.conversation_id);
    return id;
  });

export const getSuggestionsById = (db: QueryDatabaseClient, userId: string, id: string) =>
  Effect.gen(function* () {
    const result = yield* db
      .prepare(`
      SELECT id, suggestions, created_at
      FROM suggestions
      WHERE user_id = ? AND id = ?
    `)
      .bind(userId, id)
      .first<SuggestionsRow>();
    return result ?? null;
  });

export const saveSuggestions = (
  db: QueryDatabaseClient,
  userId: string,
  id: string,
  suggestions: string[],
) =>
  Effect.gen(function* () {
    yield* db
      .prepare(`
      INSERT INTO suggestions (user_id, id, suggestions, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, id) DO NOTHING
    `)
      .bind(userId, id, JSON.stringify(suggestions), nowIso())
      .run();
  });
