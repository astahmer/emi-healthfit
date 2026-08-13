import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { ConversationRevision } from "./conversation-revision.ts";
import { DatabaseQueryError, QueryDatabase, type QueryDatabaseClient } from "./query-database.ts";
import type { ConversationDatabaseSchema } from "./schema.ts";

const textEncoder = new TextEncoder();

const arrayBufferToHex = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export class ConversationCloneError extends Schema.TaggedErrorClass<ConversationCloneError>()(
  "ConversationCloneError",
  { message: Schema.String },
) {}

export class ConversationHashError extends Schema.TaggedErrorClass<ConversationHashError>()(
  "ConversationHashError",
  { message: Schema.String },
) {}

type DatabaseEffect<Value, Error = never> = Effect.Effect<Value, Error | DatabaseQueryError>;

const requireMappedId = (
  ids: Map<string, string>,
  originalId: string,
): Effect.Effect<string, ConversationCloneError> => {
  const id = ids.get(originalId);
  return id === undefined
    ? Effect.fail(new ConversationCloneError({ message: `Missing cloned id for ${originalId}` }))
    : Effect.succeed(id);
};

const hashSuggestionsKey = (
  lastAssistantText: string,
  lastUserText?: string,
): Effect.Effect<string, ConversationHashError> =>
  Effect.gen(function* () {
    const input = `${lastAssistantText}\0${lastUserText ?? ""}`;
    const buffer = yield* Effect.tryPromise({
      try: () => crypto.subtle.digest("SHA-256", textEncoder.encode(input)),
      catch: (cause) =>
        new ConversationHashError({
          message: cause instanceof Error ? cause.message : String(cause),
        }),
    });
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

export interface ConversationMessageSearchResult {
  conversation: Conversation;
  message: Message;
}

export interface SuggestionRecord {
  id: string;
  suggestions: string;
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

const createConversation = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  title?: string,
) =>
  Effect.gen(function* () {
    const id = db.runtime.createId();
    const createdAt = db.runtime.now();
    const kysely = yield* db.kysely;
    yield* QueryDatabase.tryPromise(() =>
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

const getConversations = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  search?: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    if (search !== undefined && search.trim() !== "") {
      const term = search.trim();
      const result = yield* QueryDatabase.tryPromise(() =>
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
              expressionBuilder(
                expressionBuilder.fn<number>("instr", [
                  expressionBuilder.fn<string>("lower", ["c.title"]),
                  expressionBuilder.val(term.toLocaleLowerCase()),
                ]),
                ">",
                0,
              ),
              expressionBuilder(
                expressionBuilder.fn<number>("instr", [
                  expressionBuilder.fn<string>("lower", ["m.parts"]),
                  expressionBuilder.val(term.toLocaleLowerCase()),
                ]),
                ">",
                0,
              ),
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

    const result = yield* QueryDatabase.tryPromise(() =>
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

const searchConversationMessages = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  query: string,
  excludeConversationId?: string,
  limit = 10,
) =>
  Effect.gen(function* () {
    const normalizedQuery = query.trim();
    if (normalizedQuery === "") return [];

    const kysely = yield* db.kysely;
    const term = normalizedQuery.toLocaleLowerCase();
    const searchQuery = kysely
      .selectFrom("conversations as c")
      .innerJoin("messages as m", (join) =>
        join.onRef("m.user_id", "=", "c.user_id").onRef("m.conversation_id", "=", "c.id"),
      )
      .select([
        "c.id as conversation_id",
        "c.title as conversation_title",
        "c.status as conversation_status",
        "c.pinned as conversation_pinned",
        "c.created_at as conversation_created_at",
        "c.updated_at as conversation_updated_at",
        "m.id as message_id",
        "m.parent_id as message_parent_id",
        "m.role as message_role",
        "m.parts as message_parts",
        "m.prompt_tokens as message_prompt_tokens",
        "m.completion_tokens as message_completion_tokens",
        "m.total_tokens as message_total_tokens",
        "m.model as message_model",
        "m.created_at as message_created_at",
      ])
      .where("c.user_id", "=", userId)
      .where("c.status", "in", ["regular", "archived"])
      .where((expressionBuilder) =>
        expressionBuilder(
          expressionBuilder.fn<number>("instr", [
            expressionBuilder.fn<string>("lower", ["m.parts"]),
            expressionBuilder.val(term),
          ]),
          ">",
          0,
        ),
      );
    const scopedSearchQuery =
      excludeConversationId === undefined
        ? searchQuery
        : searchQuery.where("c.id", "<>", excludeConversationId);
    const rows = yield* QueryDatabase.tryPromise(() =>
      scopedSearchQuery
        .orderBy((expressionBuilder) =>
          expressionBuilder.case().when("c.status", "=", "archived").then(1).else(0).end(),
        )
        .orderBy("c.pinned", "desc")
        .orderBy("m.created_at", "desc")
        .limit(Math.min(Math.max(Math.trunc(limit), 1), 50))
        .execute(),
    );
    return rows.map(
      (row) =>
        ({
          conversation: mapConversationRow({
            id: row.conversation_id,
            title: row.conversation_title,
            status: row.conversation_status,
            pinned: row.conversation_pinned,
            created_at: row.conversation_created_at,
            updated_at: row.conversation_updated_at,
          }),
          message: {
            id: row.message_id,
            conversation_id: row.conversation_id,
            parent_id: row.message_parent_id,
            role: row.message_role,
            parts: row.message_parts,
            prompt_tokens: row.message_prompt_tokens,
            completion_tokens: row.message_completion_tokens,
            total_tokens: row.message_total_tokens,
            model: row.message_model,
            created_at: row.message_created_at,
          },
        }) satisfies ConversationMessageSearchResult,
    );
  });

const getConversation = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* QueryDatabase.tryPromise(() =>
      kysely
        .selectFrom("conversations")
        .selectAll()
        .where("user_id", "=", userId)
        .where("id", "=", conversationId)
        .executeTakeFirst(),
    );
    return result === undefined ? null : mapConversationRow(result);
  });

export const getConversationForGeneration = getConversation;

const deleteConversation = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* QueryDatabase.tryPromise(() =>
      kysely
        .deleteFrom("conversations")
        .where("user_id", "=", userId)
        .where("id", "=", conversationId)
        .execute(),
    );
  });

const deleteEmptyConversations = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  olderThan: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* QueryDatabase.tryPromise(() =>
      kysely
        .deleteFrom("conversations")
        .where("user_id", "=", userId)
        .where("updated_at", "<", olderThan)
        .where("pinned", "=", false)
        .where((expressionBuilder) =>
          expressionBuilder.not(
            expressionBuilder.exists(
              expressionBuilder
                .selectFrom("messages")
                .select("id")
                .whereRef("messages.user_id", "=", "conversations.user_id")
                .whereRef("conversation_id", "=", "conversations.id"),
            ),
          ),
        )
        .executeTakeFirst(),
    );
    return Number(result.numDeletedRows);
  });

const updateConversationState = Effect.fn("conversation.updateState")(function* <TEnvironment>({
  db,
  userId,
  conversationId,
  status,
  pinned,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  conversationId: string;
  status?: "regular" | "archived";
  pinned?: boolean;
}) {
  if (status === undefined && pinned === undefined) return;
  const kysely = yield* db.kysely;
  yield* QueryDatabase.tryPromise(() =>
    kysely
      .updateTable("conversations")
      .set({
        updated_at: db.runtime.now(),
        ...(status === undefined ? {} : { status }),
        ...(pinned === undefined ? {} : { pinned }),
      })
      .where("user_id", "=", userId)
      .where("id", "=", conversationId)
      .execute(),
  );
});

const cloneConversation = Effect.fn("conversation.clone")(function* <TEnvironment>({
  db,
  userId,
  conversationId,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  userId: string;
  conversationId: string;
}) {
  const conversation = yield* getConversation(db, userId, conversationId);
  if (conversation === null) return null;
  const originalMessages = yield* getConversationMessages(db, userId, conversationId);
  const originalThreads = yield* getThreadsIncludingDiscarded(db, userId, conversationId);
  const kysely = yield* db.kysely;
  const threadMessageRows = yield* QueryDatabase.tryPromise(() =>
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
  const clonedConversationId = db.runtime.createId();
  const timestamp = db.runtime.now();
  const messageIds = new Map(
    originalMessages.map((message) => [message.id, db.runtime.createId()]),
  );
  const threadIds = new Map(originalThreads.map((thread) => [thread.id, db.runtime.createId()]));

  const messageQueries = yield* Effect.forEach(originalMessages, (message) =>
    Effect.gen(function* () {
      const id = yield* requireMappedId(messageIds, message.id);
      const parentId =
        message.parent_id === null ? null : yield* requireMappedId(messageIds, message.parent_id);
      return kysely.insertInto("messages").values({
        id,
        user_id: userId,
        conversation_id: clonedConversationId,
        parent_id: parentId,
        role: message.role,
        parts: message.parts,
        prompt_tokens: message.prompt_tokens,
        completion_tokens: message.completion_tokens,
        total_tokens: message.total_tokens,
        model: message.model,
        created_at: message.created_at,
      });
    }),
  );
  const threadQueries = yield* Effect.forEach(originalThreads, (thread) =>
    Effect.gen(function* () {
      const id = yield* requireMappedId(threadIds, thread.id);
      const anchorMessageId = yield* requireMappedId(messageIds, thread.anchor_message_id);
      return kysely.insertInto("threads").values({
        id,
        user_id: userId,
        conversation_id: clonedConversationId,
        anchor_message_id: anchorMessageId,
        title: thread.title,
        status: thread.status,
        pinned: thread.pinned,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
      });
    }),
  );
  const threadMessageQueries = yield* Effect.forEach(threadMessageRows, (row) =>
    Effect.gen(function* () {
      const threadId = yield* requireMappedId(threadIds, row.thread_id);
      const messageId = yield* requireMappedId(messageIds, row.message_id);
      return kysely.insertInto("thread_messages").values({
        user_id: userId,
        thread_id: threadId,
        message_id: messageId,
        included_at: row.included_at,
      });
    }),
  );

  yield* QueryDatabase.transaction(db, [
    kysely.insertInto("conversations").values({
      id: clonedConversationId,
      user_id: userId,
      title: `${conversation.title ?? "New chat"} copy`,
      status: "regular",
      pinned: false,
      created_at: timestamp,
      updated_at: timestamp,
    }),
    ...messageQueries,
    ...threadQueries,
    ...threadMessageQueries,
  ]);
  return yield* getConversation(db, userId, clonedConversationId);
});

const renameConversation = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  conversationId: string,
  title: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* QueryDatabase.tryPromise(() =>
      kysely
        .updateTable("conversations")
        .set({ title, updated_at: db.runtime.now() })
        .where("user_id", "=", userId)
        .where("id", "=", conversationId)
        .execute(),
    );
  });

const getConversationMessages = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    return yield* QueryDatabase.tryPromise(() =>
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

const reviseConversationMessage = Effect.fn("conversation.reviseMessage")(function* <TEnvironment>({
  db,
  userId,
  conversationId,
  messageId,
  parts,
  threadId,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
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

  const deletedMessageIds = ConversationRevision.getDeletionIds({
    conversationRows,
    scopedRows,
    messageId,
    includeDescendants: threadId === undefined,
  });
  const kysely = yield* db.kysely;
  yield* QueryDatabase.transaction(db, [
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
      .set({ updated_at: db.runtime.now() })
      .where("user_id", "=", userId)
      .where("id", "=", conversationId),
  ]);
  return true;
});

const saveConversationMessages = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  conversationId: string,
  parentId: string | null,
  messages: Array<{
    id?: string;
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

    const baseTime = db.runtime.nowMilliseconds();
    const ids: string[] = [];
    const kysely = yield* db.kysely;
    const statements = messages.map((message, index) => {
      const id = message.id ?? db.runtime.createId();
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

    yield* QueryDatabase.transaction(db, [
      ...statements,
      kysely
        .updateTable("conversations")
        .set({ updated_at: db.runtime.now() })
        .where("user_id", "=", userId)
        .where("id", "=", conversationId),
    ]);
    return ids;
  });

const createThread = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
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

    const id = db.runtime.createId();
    const createdAt = db.runtime.now();
    const kysely = yield* db.kysely;
    yield* QueryDatabase.transaction(db, [
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
const getThreads = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* QueryDatabase.tryPromise(() =>
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

const getThreadsIncludingDiscarded = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  conversationId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* QueryDatabase.tryPromise(() =>
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

const getThread = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  threadId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* QueryDatabase.tryPromise(() =>
      kysely
        .selectFrom("threads")
        .selectAll()
        .where("user_id", "=", userId)
        .where("id", "=", threadId)
        .executeTakeFirst(),
    );
    return result === undefined ? null : mapThreadRow(result);
  });

const getThreadByAnchor = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  conversationId: string,
  anchorMessageId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* QueryDatabase.tryPromise(() =>
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

const renameThread = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  threadId: string,
  title: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* QueryDatabase.tryPromise(() =>
      kysely
        .updateTable("threads")
        .set({ title, updated_at: db.runtime.now() })
        .where("user_id", "=", userId)
        .where("id", "=", threadId)
        .execute(),
    );
  });

const pinThread = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  threadId: string,
  pinned: boolean,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* QueryDatabase.tryPromise(() =>
      kysely
        .updateTable("threads")
        .set({ pinned, updated_at: db.runtime.now() })
        .where("user_id", "=", userId)
        .where("id", "=", threadId)
        .execute(),
    );
  });

const discardThread = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  threadId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* QueryDatabase.tryPromise(() =>
      kysely
        .updateTable("threads")
        .set({ status: "discarded", updated_at: db.runtime.now() })
        .where("user_id", "=", userId)
        .where("id", "=", threadId)
        .execute(),
    );
  });

const restoreThread = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  threadId: string,
) =>
  Effect.gen(function* () {
    const thread = yield* getThread(db, userId, threadId);
    if (thread === null) return;
    const updatedAt = db.runtime.now();
    const kysely = yield* db.kysely;
    yield* QueryDatabase.transaction(db, [
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

const addThreadMessage = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
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
    yield* QueryDatabase.tryPromise(() =>
      kysely
        .insertInto("thread_messages")
        .values({
          user_id: userId,
          thread_id: threadId,
          message_id: messageId,
          included_at: db.runtime.now(),
        })
        .onConflict((conflict) => conflict.doNothing())
        .execute(),
    );
    return true;
  });
const getThreadMessages = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  threadId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    return yield* QueryDatabase.tryPromise(() =>
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

const getMessage = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  messageId: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* QueryDatabase.tryPromise(() =>
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

const summarizeThread = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  threadId: string,
  summaryText: string,
  targetMessageId?: string,
) =>
  Effect.gen(function* () {
    const thread = yield* getThread(db, userId, threadId);
    if (thread === null) return null;

    const id = db.runtime.createId();
    const createdAt = db.runtime.now();
    const kysely = yield* db.kysely;
    yield* QueryDatabase.transaction(db, [
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

const getSuggestionsById = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  id: string,
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* QueryDatabase.tryPromise(() =>
      kysely
        .selectFrom("suggestions")
        .select(["id", "suggestions", "created_at"])
        .where("user_id", "=", userId)
        .where("id", "=", id)
        .executeTakeFirst(),
    );
    return result ?? null;
  });

const saveSuggestions = <TEnvironment>(
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>,
  userId: string,
  id: string,
  suggestions: string[],
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    yield* QueryDatabase.tryPromise(() =>
      kysely
        .insertInto("suggestions")
        .values({
          user_id: userId,
          id,
          suggestions: JSON.stringify(suggestions),
          created_at: db.runtime.now(),
        })
        .onConflict((conflict) => conflict.doNothing())
        .execute(),
    );
  });

export interface ConversationDatabaseShape {
  readonly addThreadMessage: (input: {
    readonly userId: string;
    readonly threadId: string;
    readonly messageId: string;
  }) => DatabaseEffect<boolean>;
  readonly cloneConversation: (input: {
    readonly userId: string;
    readonly conversationId: string;
  }) => DatabaseEffect<Conversation | null, ConversationCloneError>;
  readonly createConversation: (input: {
    readonly userId: string;
    readonly title?: string;
  }) => DatabaseEffect<string>;
  readonly createThread: (input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly anchorMessageId: string;
    readonly title?: string;
  }) => DatabaseEffect<string | null>;
  readonly deleteConversation: (input: {
    readonly userId: string;
    readonly conversationId: string;
  }) => DatabaseEffect<void>;
  readonly deleteEmptyConversations: (input: {
    readonly userId: string;
    readonly olderThan: string;
  }) => DatabaseEffect<number>;
  readonly discardThread: (input: {
    readonly userId: string;
    readonly threadId: string;
  }) => DatabaseEffect<void>;
  readonly getConversation: (input: {
    readonly userId: string;
    readonly conversationId: string;
  }) => DatabaseEffect<Conversation | null>;
  readonly getConversationMessages: (input: {
    readonly userId: string;
    readonly conversationId: string;
  }) => DatabaseEffect<ReadonlyArray<Message>>;
  readonly getConversations: (input: {
    readonly userId: string;
    readonly search?: string;
  }) => DatabaseEffect<ReadonlyArray<Conversation>>;
  readonly searchConversationMessages: (input: {
    readonly userId: string;
    readonly query: string;
    readonly excludeConversationId?: string;
    readonly limit?: number;
  }) => DatabaseEffect<ReadonlyArray<ConversationMessageSearchResult>>;
  readonly getMessage: (input: {
    readonly userId: string;
    readonly messageId: string;
  }) => DatabaseEffect<Message | null>;
  readonly getSuggestionsById: (input: {
    readonly userId: string;
    readonly id: string;
  }) => DatabaseEffect<SuggestionRecord | null>;
  readonly getThread: (input: {
    readonly userId: string;
    readonly threadId: string;
  }) => DatabaseEffect<Thread | null>;
  readonly getThreadByAnchor: (input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly anchorMessageId: string;
  }) => DatabaseEffect<Thread | null>;
  readonly getThreadMessages: (input: {
    readonly userId: string;
    readonly threadId: string;
  }) => DatabaseEffect<ReadonlyArray<Message>>;
  readonly getThreads: (input: {
    readonly userId: string;
    readonly conversationId: string;
  }) => DatabaseEffect<ReadonlyArray<Thread>>;
  readonly getThreadsIncludingDiscarded: (input: {
    readonly userId: string;
    readonly conversationId: string;
  }) => DatabaseEffect<ReadonlyArray<Thread>>;
  readonly pinThread: (input: {
    readonly userId: string;
    readonly threadId: string;
    readonly pinned: boolean;
  }) => DatabaseEffect<void>;
  readonly renameConversation: (input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly title: string;
  }) => DatabaseEffect<void>;
  readonly renameThread: (input: {
    readonly userId: string;
    readonly threadId: string;
    readonly title: string;
  }) => DatabaseEffect<void>;
  readonly restoreThread: (input: {
    readonly userId: string;
    readonly threadId: string;
  }) => DatabaseEffect<void>;
  readonly reviseConversationMessage: (input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly messageId: string;
    readonly parts: ReadonlyArray<unknown>;
    readonly threadId?: string;
  }) => DatabaseEffect<boolean>;
  readonly saveConversationMessages: (input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly parentId: string | null;
    readonly messages: ReadonlyArray<{
      readonly id?: string;
      readonly role: Message["role"];
      readonly parts: ReadonlyArray<unknown>;
      readonly usage?: MessageUsage;
      readonly model?: string;
    }>;
  }) => DatabaseEffect<ReadonlyArray<string>>;
  readonly saveSuggestions: (input: {
    readonly userId: string;
    readonly id: string;
    readonly suggestions: ReadonlyArray<string>;
  }) => DatabaseEffect<void>;
  readonly summarizeThread: (input: {
    readonly userId: string;
    readonly threadId: string;
    readonly summaryText: string;
    readonly targetMessageId?: string;
  }) => DatabaseEffect<string | null>;
  readonly updateConversationState: (input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly status?: "regular" | "archived";
    readonly pinned?: boolean;
  }) => DatabaseEffect<void>;
}

export class ConversationDatabase extends Context.Service<
  ConversationDatabase,
  ConversationDatabaseShape
>()("@emi/core/server/database/ConversationDatabase") {
  static readonly hashSuggestionsKey = hashSuggestionsKey;
  static layer({
    db,
  }: {
    readonly db: QueryDatabaseClient<ConversationDatabaseSchema>;
  }): Layer.Layer<ConversationDatabase> {
    return Layer.succeed(ConversationDatabase, {
      addThreadMessage: ({ userId, threadId, messageId }) =>
        addThreadMessage(db, userId, threadId, messageId),
      cloneConversation: ({ userId, conversationId }) =>
        cloneConversation({ db, userId, conversationId }),
      createConversation: ({ userId, title }) => createConversation(db, userId, title),
      createThread: ({ userId, conversationId, anchorMessageId, title }) =>
        createThread(db, userId, conversationId, anchorMessageId, title),
      deleteConversation: ({ userId, conversationId }) =>
        deleteConversation(db, userId, conversationId),
      deleteEmptyConversations: ({ userId, olderThan }) =>
        deleteEmptyConversations(db, userId, olderThan),
      discardThread: ({ userId, threadId }) => discardThread(db, userId, threadId),
      getConversation: ({ userId, conversationId }) => getConversation(db, userId, conversationId),
      getConversationMessages: ({ userId, conversationId }) =>
        getConversationMessages(db, userId, conversationId),
      getConversations: ({ userId, search }) => getConversations(db, userId, search),
      searchConversationMessages: ({ userId, query, excludeConversationId, limit }) =>
        searchConversationMessages(db, userId, query, excludeConversationId, limit),
      getMessage: ({ userId, messageId }) => getMessage(db, userId, messageId),
      getSuggestionsById: ({ userId, id }) => getSuggestionsById(db, userId, id),
      getThread: ({ userId, threadId }) => getThread(db, userId, threadId),
      getThreadByAnchor: ({ userId, conversationId, anchorMessageId }) =>
        getThreadByAnchor(db, userId, conversationId, anchorMessageId),
      getThreadMessages: ({ userId, threadId }) => getThreadMessages(db, userId, threadId),
      getThreads: ({ userId, conversationId }) => getThreads(db, userId, conversationId),
      getThreadsIncludingDiscarded: ({ userId, conversationId }) =>
        getThreadsIncludingDiscarded(db, userId, conversationId),
      pinThread: ({ userId, threadId, pinned }) => pinThread(db, userId, threadId, pinned),
      renameConversation: ({ userId, conversationId, title }) =>
        renameConversation(db, userId, conversationId, title),
      renameThread: ({ userId, threadId, title }) => renameThread(db, userId, threadId, title),
      restoreThread: ({ userId, threadId }) => restoreThread(db, userId, threadId),
      reviseConversationMessage: ({ userId, conversationId, messageId, parts, threadId }) =>
        reviseConversationMessage({
          db,
          userId,
          conversationId,
          messageId,
          parts: [...parts],
          threadId,
        }),
      saveConversationMessages: ({ userId, conversationId, parentId, messages }) =>
        saveConversationMessages(
          db,
          userId,
          conversationId,
          parentId,
          messages.map((message) => ({
            ...message,
            parts: [...message.parts],
          })),
        ),
      saveSuggestions: ({ userId, id, suggestions }) =>
        saveSuggestions(db, userId, id, [...suggestions]),
      summarizeThread: ({ userId, threadId, summaryText, targetMessageId }) =>
        summarizeThread(db, userId, threadId, summaryText, targetMessageId),
      updateConversationState: ({ userId, conversationId, status, pinned }) =>
        updateConversationState({ db, userId, conversationId, status, pinned }),
    });
  }
}
