import * as Effect from "effect/Effect";
import { getRevisionDeletionIds } from "../chat/conversation-revision.ts";
import { runTransaction, type QueryDatabaseClient } from "../../platform/db/client.ts";

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
  status: Conversation["status"] | "temporary";
  pinned: boolean | number;
  created_at: string;
  updated_at: string;
}

const mapConversationRow = (row: ConversationRow): Conversation => ({
  id: row.id,
  title: row.title,
  status: row.status === "archived" ? "archived" : "regular",
  pinned: Boolean(row.pinned),
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
  role: "system" | "user" | "assistant" | "summary";
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

interface ThreadRow {
  id: string;
  conversation_id: string;
  anchor_message_id: string;
  title: string | null;
  status: Thread["status"];
  pinned: boolean | number;
  created_at: string;
  updated_at: string;
}

const mapThreadRow = (row: ThreadRow): Thread => ({
  id: row.id,
  conversation_id: row.conversation_id,
  anchor_message_id: row.anchor_message_id,
  title: row.title,
  status: row.status,
  pinned: Boolean(row.pinned),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const nowIso = (): string => new Date().toISOString();

export const createConversation = (db: QueryDatabaseClient, userId: string, title?: string) =>
  Effect.gen(function* () {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    const kysely = yield* db.kysely;
    yield* Effect.promise(() =>
      kysely
        .insertInto("conversations")
        .values({
          id,
          user_id: userId,
          title: title ?? null,
          status: "regular",
          pinned: false,
          created_at: createdAt,
          updated_at: createdAt,
        })
        .execute(),
    );
    return id;
  });

export const getConversations = (db: QueryDatabaseClient, userId: string, search?: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    if (search !== undefined && search.trim() !== "") {
      const term = `%${search.trim()}%`;
      const result = yield* Effect.promise(() =>
        kysely
          .selectFrom("conversations as c")
          .leftJoin("messages as m", (join) =>
            join.onRef("m.user_id", "=", "c.user_id").onRef("m.conversation_id", "=", "c.id"),
          )
          .selectAll("c")
          .distinct()
          .where("c.user_id", "=", userId)
          .where("c.status", "in", ["regular", "archived"])
          .where((expressionBuilder) =>
            expressionBuilder.or([
              expressionBuilder("c.title", "like", term),
              expressionBuilder("m.parts", "like", term),
            ]),
          )
          .orderBy((expressionBuilder) =>
            expressionBuilder.case().when("c.status", "=", "archived").then(1).else(0).end(),
          )
          .orderBy("c.pinned", "desc")
          .orderBy("c.updated_at", "desc")
          .limit(100)
          .execute(),
      );
      return result.map(mapConversationRow);
    }

    const result = yield* Effect.promise(() =>
      kysely
        .selectFrom("conversations")
        .selectAll()
        .where("user_id", "=", userId)
        .where("status", "in", ["regular", "archived"])
        .orderBy((expressionBuilder) =>
          expressionBuilder.case().when("status", "=", "archived").then(1).else(0).end(),
        )
        .orderBy("pinned", "desc")
        .orderBy("updated_at", "desc")
        .limit(100)
        .execute(),
    );
    return result.map(mapConversationRow);
  });

export const getConversation = (db: QueryDatabaseClient, userId: string, conversationId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* Effect.promise(() =>
      kysely
        .selectFrom("conversations")
        .selectAll()
        .where("user_id", "=", userId)
        .where("id", "=", conversationId)
        .executeTakeFirst(),
    );
    return result === undefined ? null : mapConversationRow(result);
  });

export const deleteConversation = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* Effect.promise(() =>
      kysely
        .deleteFrom("conversations")
        .where("user_id", "=", userId)
        .where("id", "=", conversationId)
        .execute(),
    );
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
  if (status === undefined && pinned === undefined) return;
  const kysely = yield* db.kysely;
  yield* Effect.promise(() =>
    kysely
      .updateTable("conversations")
      .set({
        updated_at: nowIso(),
        ...(status === undefined ? {} : { status }),
        ...(pinned === undefined ? {} : { pinned }),
      })
      .where("user_id", "=", userId)
      .where("id", "=", conversationId)
      .execute(),
  );
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
  const kysely = yield* db.kysely;
  const threadMessageRows = yield* Effect.promise(() =>
    kysely
      .selectFrom("thread_messages as tm")
      .innerJoin("threads as t", (join) =>
        join.onRef("t.user_id", "=", "tm.user_id").onRef("t.id", "=", "tm.thread_id"),
      )
      .select(["tm.thread_id", "tm.message_id", "tm.included_at"])
      .where("tm.user_id", "=", userId)
      .where("t.conversation_id", "=", conversationId)
      .execute(),
  );
  const clonedConversationId = crypto.randomUUID();
  const timestamp = nowIso();
  const messageIds = new Map(originalMessages.map((message) => [message.id, crypto.randomUUID()]));
  const threadIds = new Map(originalThreads.map((thread) => [thread.id, crypto.randomUUID()]));

  yield* runTransaction(db, [
    kysely.insertInto("conversations").values({
      id: clonedConversationId,
      user_id: userId,
      title: `${conversation.title ?? "New chat"} copy`,
      status: "regular",
      pinned: false,
      created_at: timestamp,
      updated_at: timestamp,
    }),
    ...originalMessages.map((message) =>
      kysely.insertInto("messages").values({
        id: requireMappedId(messageIds, message.id),
        user_id: userId,
        conversation_id: clonedConversationId,
        parent_id: message.parent_id === null ? null : (messageIds.get(message.parent_id) ?? null),
        role: message.role,
        parts: message.parts,
        prompt_tokens: message.prompt_tokens,
        completion_tokens: message.completion_tokens,
        total_tokens: message.total_tokens,
        model: message.model,
        created_at: message.created_at,
      }),
    ),
    ...originalThreads.map((thread) =>
      kysely.insertInto("threads").values({
        id: requireMappedId(threadIds, thread.id),
        user_id: userId,
        conversation_id: clonedConversationId,
        anchor_message_id: requireMappedId(messageIds, thread.anchor_message_id),
        title: thread.title,
        status: thread.status,
        pinned: thread.pinned,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
      }),
    ),
    ...threadMessageRows.flatMap((row) => {
      const threadId = threadIds.get(row.thread_id);
      const messageId = messageIds.get(row.message_id);
      if (threadId === undefined || messageId === undefined) return [];
      return [
        kysely.insertInto("thread_messages").values({
          user_id: userId,
          thread_id: threadId,
          message_id: messageId,
          included_at: row.included_at,
        }),
      ];
    }),
  ]);
  return yield* getConversation(db, userId, clonedConversationId);
});

export const renameConversation = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
  title: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* Effect.promise(() =>
      kysely
        .updateTable("conversations")
        .set({ title, updated_at: nowIso() })
        .where("user_id", "=", userId)
        .where("id", "=", conversationId)
        .execute(),
    );
  });

export const getConversationMessages = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    return yield* Effect.promise(() =>
      kysely
        .selectFrom("messages")
        .select([
          "id",
          "conversation_id",
          "parent_id",
          "role",
          "parts",
          "prompt_tokens",
          "completion_tokens",
          "total_tokens",
          "model",
          "created_at",
        ])
        .where("user_id", "=", userId)
        .where("conversation_id", "=", conversationId)
        .orderBy("created_at", "asc")
        .execute(),
    );
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
  const kysely = yield* db.kysely;
  yield* runTransaction(db, [
    kysely
      .updateTable("messages")
      .set({
        parts: JSON.stringify(parts),
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        model: null,
      })
      .where("user_id", "=", userId)
      .where("id", "=", messageId)
      .where("conversation_id", "=", conversationId),
    ...deletedMessageIds.map((deletedMessageId) =>
      kysely
        .deleteFrom("messages")
        .where("user_id", "=", userId)
        .where("id", "=", deletedMessageId),
    ),
    kysely
      .updateTable("conversations")
      .set({ updated_at: nowIso() })
      .where("user_id", "=", userId)
      .where("id", "=", conversationId),
  ]);
  return true;
});

export const saveConversationMessages = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
  parentId: string | null,
  messages: Array<{
    role: Message["role"];
    parts: unknown[];
    usage?: MessageUsage;
    model?: string;
  }>,
) =>
  Effect.gen(function* () {
    if (messages.length === 0) return [];

    const conversation = yield* getConversation(db, userId, conversationId);
    if (conversation === null) return [];

    if (parentId !== null) {
      const parent = yield* getMessage(db, userId, parentId);
      if (parent === null || parent.conversation_id !== conversationId) return [];
    }

    const baseTime = Date.now();
    const ids: string[] = [];
    const kysely = yield* db.kysely;
    const statements = messages.map((message, index) => {
      const id = crypto.randomUUID();
      ids.push(id);
      return kysely.insertInto("messages").values({
        id,
        user_id: userId,
        conversation_id: conversationId,
        parent_id: parentId,
        role: message.role,
        parts: JSON.stringify(message.parts),
        prompt_tokens: message.usage?.prompt_tokens ?? null,
        completion_tokens: message.usage?.completion_tokens ?? null,
        total_tokens: message.usage?.total_tokens ?? null,
        model: message.model ?? null,
        created_at: new Date(baseTime + index).toISOString(),
      });
    });

    yield* runTransaction(db, [
      ...statements,
      kysely
        .updateTable("conversations")
        .set({ updated_at: nowIso() })
        .where("user_id", "=", userId)
        .where("id", "=", conversationId),
    ]);
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
    const conversation = yield* getConversation(db, userId, conversationId);
    if (conversation === null) return null;

    const anchor = yield* getMessage(db, userId, anchorMessageId);
    if (anchor === null || anchor.conversation_id !== conversationId) return null;

    const id = crypto.randomUUID();
    const createdAt = nowIso();
    const kysely = yield* db.kysely;
    yield* runTransaction(db, [
      kysely.insertInto("threads").values({
        id,
        user_id: userId,
        conversation_id: conversationId,
        anchor_message_id: anchorMessageId,
        title: title ?? null,
        status: "regular",
        pinned: false,
        created_at: createdAt,
        updated_at: createdAt,
      }),
      kysely
        .updateTable("conversations")
        .set({ updated_at: createdAt })
        .where("user_id", "=", userId)
        .where("id", "=", conversationId),
      kysely
        .insertInto("thread_messages")
        .values({
          user_id: userId,
          thread_id: id,
          message_id: anchorMessageId,
          included_at: createdAt,
        })
        .onConflict((conflict) => conflict.doNothing()),
    ]);
    return id;
  });
export const getThreads = (db: QueryDatabaseClient, userId: string, conversationId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* Effect.promise(() =>
      kysely
        .selectFrom("threads")
        .selectAll()
        .where("user_id", "=", userId)
        .where("conversation_id", "=", conversationId)
        .where("status", "!=", "discarded")
        .orderBy("pinned", "desc")
        .orderBy("updated_at", "desc")
        .execute(),
    );
    return result.map(mapThreadRow);
  });

export const getThreadsIncludingDiscarded = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* Effect.promise(() =>
      kysely
        .selectFrom("threads")
        .selectAll()
        .where("user_id", "=", userId)
        .where("conversation_id", "=", conversationId)
        .orderBy("pinned", "desc")
        .orderBy("updated_at", "desc")
        .execute(),
    );
    return result.map(mapThreadRow);
  });

export const getThread = (db: QueryDatabaseClient, userId: string, threadId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* Effect.promise(() =>
      kysely
        .selectFrom("threads")
        .selectAll()
        .where("user_id", "=", userId)
        .where("id", "=", threadId)
        .executeTakeFirst(),
    );
    return result === undefined ? null : mapThreadRow(result);
  });

export const getThreadByAnchor = (
  db: QueryDatabaseClient,
  userId: string,
  conversationId: string,
  anchorMessageId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* Effect.promise(() =>
      kysely
        .selectFrom("threads")
        .selectAll()
        .where("user_id", "=", userId)
        .where("conversation_id", "=", conversationId)
        .where("anchor_message_id", "=", anchorMessageId)
        .where("status", "!=", "merged")
        .orderBy("created_at", "desc")
        .limit(1)
        .executeTakeFirst(),
    );
    return result === undefined ? null : mapThreadRow(result);
  });

export const renameThread = (
  db: QueryDatabaseClient,
  userId: string,
  threadId: string,
  title: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* Effect.promise(() =>
      kysely
        .updateTable("threads")
        .set({ title, updated_at: nowIso() })
        .where("user_id", "=", userId)
        .where("id", "=", threadId)
        .execute(),
    );
  });

export const pinThread = (
  db: QueryDatabaseClient,
  userId: string,
  threadId: string,
  pinned: boolean,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* Effect.promise(() =>
      kysely
        .updateTable("threads")
        .set({ pinned, updated_at: nowIso() })
        .where("user_id", "=", userId)
        .where("id", "=", threadId)
        .execute(),
    );
  });

export const discardThread = (db: QueryDatabaseClient, userId: string, threadId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* Effect.promise(() =>
      kysely
        .updateTable("threads")
        .set({ status: "discarded", updated_at: nowIso() })
        .where("user_id", "=", userId)
        .where("id", "=", threadId)
        .execute(),
    );
  });

export const restoreThread = (db: QueryDatabaseClient, userId: string, threadId: string) =>
  Effect.gen(function* () {
    const thread = yield* getThread(db, userId, threadId);
    if (thread === null) return;
    const updatedAt = nowIso();
    const kysely = yield* db.kysely;
    yield* runTransaction(db, [
      kysely
        .updateTable("threads")
        .set({ status: "regular", updated_at: updatedAt })
        .where("user_id", "=", userId)
        .where("id", "=", threadId),
      kysely
        .updateTable("conversations")
        .set({ updated_at: updatedAt })
        .where("user_id", "=", userId)
        .where("id", "=", thread.conversation_id),
    ]);
  });

export const addThreadMessage = (
  db: QueryDatabaseClient,
  userId: string,
  threadId: string,
  messageId: string,
) =>
  Effect.gen(function* () {
    const thread = yield* getThread(db, userId, threadId);
    if (thread === null) return false;

    const message = yield* getMessage(db, userId, messageId);
    if (message === null || message.conversation_id !== thread.conversation_id) return false;

    const kysely = yield* db.kysely;
    yield* Effect.promise(() =>
      kysely
        .insertInto("thread_messages")
        .values({
          user_id: userId,
          thread_id: threadId,
          message_id: messageId,
          included_at: nowIso(),
        })
        .onConflict((conflict) => conflict.doNothing())
        .execute(),
    );
    return true;
  });
export const getThreadMessages = (db: QueryDatabaseClient, userId: string, threadId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    return yield* Effect.promise(() =>
      kysely
        .selectFrom("messages as m")
        .innerJoin("thread_messages as tm", (join) =>
          join.onRef("tm.user_id", "=", "m.user_id").onRef("tm.message_id", "=", "m.id"),
        )
        .select([
          "m.id",
          "m.conversation_id",
          "m.parent_id",
          "m.role",
          "m.parts",
          "m.prompt_tokens",
          "m.completion_tokens",
          "m.total_tokens",
          "m.model",
          "m.created_at",
        ])
        .where("tm.user_id", "=", userId)
        .where("tm.thread_id", "=", threadId)
        .orderBy("m.created_at", "asc")
        .execute(),
    );
  });

export const getMessage = (db: QueryDatabaseClient, userId: string, messageId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* Effect.promise(() =>
      kysely
        .selectFrom("messages")
        .select([
          "id",
          "conversation_id",
          "parent_id",
          "role",
          "parts",
          "prompt_tokens",
          "completion_tokens",
          "total_tokens",
          "model",
          "created_at",
        ])
        .where("user_id", "=", userId)
        .where("id", "=", messageId)
        .executeTakeFirst(),
    );
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
    const kysely = yield* db.kysely;
    yield* runTransaction(db, [
      kysely.insertInto("messages").values({
        id,
        user_id: userId,
        conversation_id: thread.conversation_id,
        parent_id: targetMessageId ?? thread.anchor_message_id,
        role: "summary",
        parts: JSON.stringify([{ type: "text", text: summaryText }]),
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        model: null,
        created_at: createdAt,
      }),
      kysely
        .insertInto("thread_messages")
        .values({ user_id: userId, thread_id: threadId, message_id: id, included_at: createdAt })
        .onConflict((conflict) => conflict.doNothing()),
      kysely
        .updateTable("conversations")
        .set({ updated_at: createdAt })
        .where("user_id", "=", userId)
        .where("id", "=", thread.conversation_id),
    ]);
    return id;
  });

export const getSuggestionsById = (db: QueryDatabaseClient, userId: string, id: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* Effect.promise(() =>
      kysely
        .selectFrom("suggestions")
        .select(["id", "suggestions", "created_at"])
        .where("user_id", "=", userId)
        .where("id", "=", id)
        .executeTakeFirst(),
    );
    return result ?? null;
  });

export const saveSuggestions = (
  db: QueryDatabaseClient,
  userId: string,
  id: string,
  suggestions: string[],
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* Effect.promise(() =>
      kysely
        .insertInto("suggestions")
        .values({
          user_id: userId,
          id,
          suggestions: JSON.stringify(suggestions),
          created_at: nowIso(),
        })
        .onConflict((conflict) => conflict.doNothing())
        .execute(),
    );
  });
