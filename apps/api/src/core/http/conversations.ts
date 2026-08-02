import {
  BadRequest,
  CoreApi,
  NotFound,
  type Conversation as ApiConversation,
  type Message as ApiMessage,
  type Thread as ApiThread,
  type ThreadWithMessages as ApiThreadWithMessages,
} from "@emi/core/contract";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { safeValidateUIMessages } from "ai";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { extractMemories, generateConversationSummary } from "@emi/core/chat";
import { makeConversationStore, type ConversationDatabaseSchema } from "@emi/core/server/legacy";
import { CurrentRequestContext, CurrentUser } from "../auth/request-auth.ts";
import { refreshMemorySummary } from "../chat/memory-context.ts";
import { getGeneration, recordChatEvent } from "../chat/generation-store.ts";
import {
  type Conversation,
  cloneConversation,
  createConversation,
  createThread,
  deleteConversation,
  discardThread,
  getConversation,
  getConversationMessages,
  getMessage,
  getThread,
  getThreadByAnchor,
  getThreadMessages,
  getThreads,
  getThreadsIncludingDiscarded,
  pinThread,
  renameConversation,
  renameThread,
  reviseConversationMessage,
  restoreThread,
  saveConversationMessages,
  type Thread,
  updateConversationState,
} from "../db/conversations.ts";
import { narrowQueryDatabaseClient, type QueryDatabaseClient } from "../../platform/db/client.ts";
import {
  getMemories,
  insertMemories,
  listMemoryIdsForMessage,
  type MemoryDatabaseSchema,
} from "../db/memories.ts";
import { decodeMessageParts, textFromMessageParts } from "./codecs.ts";
import { withInternalError } from "./errors.ts";

const MessageRole = Schema.Literals(["user", "assistant", "system", "summary"]);

const toApiConversation = (conversation: Conversation): ApiConversation => ({
  id: conversation.id,
  title: conversation.title,
  status: conversation.status,
  pinned: conversation.pinned,
  created_at: conversation.created_at,
  updated_at: conversation.updated_at,
});

const toApiThread = (thread: Thread): ApiThread => ({
  id: thread.id,
  conversation_id: thread.conversation_id,
  anchor_message_id: thread.anchor_message_id,
  title: thread.title,
  status: thread.status,
  pinned: thread.pinned,
  created_at: thread.created_at,
  updated_at: thread.updated_at,
});

const toApiThreadWithMessages = ({
  thread,
  messageIds,
}: {
  thread: Thread;
  messageIds: string[];
}): ApiThreadWithMessages => ({
  ...toApiThread(thread),
  message_ids: messageIds,
});

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
}): ApiMessage => {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    parentId: row.parent_id,
    role: Schema.decodeUnknownSync(MessageRole)(row.role),
    parts: decodeMessageParts(row.parts),
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
  };
};

export const conversationsHandlers = ({
  db,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<never>;
}) => {
  const conversationDb = narrowQueryDatabaseClient<ConversationDatabaseSchema>(db);
  return HttpApiBuilder.group(CoreApi, "conversations", (handlers) =>
    handlers
      .handle(
        "list",
        Effect.fn("httpApi.conversations.list")(
          function* ({ query }) {
            const requestContext = yield* CurrentRequestContext;
            const store = makeConversationStore({ db: conversationDb, requestContext });
            const conversations = yield* store.list(query.search);
            return { conversations: conversations.map(toApiConversation) };
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "create",
        Effect.fn("httpApi.conversations.create")(
          function* () {
            const requestContext = yield* CurrentRequestContext;
            const store = makeConversationStore({ db: conversationDb, requestContext });
            const id = yield* store.create();
            return { id };
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "createWithMessages",
        Effect.fn("httpApi.conversations.createWithMessages")(
          function* ({ payload }) {
            const user = yield* CurrentUser;
            if (payload.messages.length === 0) {
              return yield* new BadRequest({
                message: "Conversation requires at least one message",
              });
            }
            const validated = yield* Effect.promise(() =>
              safeValidateUIMessages({
                messages: payload.messages.map((message, index) => ({
                  id: `import-${index}`,
                  role: message.role,
                  parts: message.parts,
                })),
              }),
            );
            if (!validated.success) {
              return yield* new BadRequest({ message: validated.error.message });
            }
            const id = yield* createConversation(conversationDb, user.id, payload.title?.trim());
            yield* saveConversationMessages(
              conversationDb,
              user.id,
              id,
              null,
              validated.data.map((message) => ({
                role: message.role,
                parts: message.parts,
              })),
            );
            const conversation = yield* getConversation(conversationDb, user.id, id);
            if (conversation === null) {
              return yield* new NotFound({ message: "Conversation not found" });
            }
            return { conversation: toApiConversation(conversation) };
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "remove",
        Effect.fn("httpApi.conversations.remove")(
          function* ({ params }) {
            const user = yield* CurrentUser;
            yield* deleteConversation(conversationDb, user.id, params.id);
            return { success: true } as const;
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "updateState",
        Effect.fn("httpApi.conversations.updateState")(
          function* ({ params, payload }) {
            const user = yield* CurrentUser;
            yield* updateConversationState({
              db: conversationDb,
              userId: user.id,
              conversationId: params.id,
              status: payload.status,
              pinned: payload.pinned,
            });
            const conversation = yield* getConversation(conversationDb, user.id, params.id);
            if (conversation === null) {
              return yield* new NotFound({ message: "Conversation not found" });
            }
            return { conversation: toApiConversation(conversation) };
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "clone",
        Effect.fn("httpApi.conversations.clone")(
          function* ({ params }) {
            const user = yield* CurrentUser;
            const conversation = yield* cloneConversation({
              db: conversationDb,
              userId: user.id,
              conversationId: params.id,
            });
            if (conversation === null) {
              return yield* new NotFound({ message: "Conversation not found" });
            }
            return { conversation: toApiConversation(conversation) };
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "compact",
        Effect.fn("httpApi.conversations.compact")(
          function* ({ params, payload }) {
            const user = yield* CurrentUser;
            const conversation = yield* getConversation(conversationDb, user.id, params.id);
            if (conversation === null) {
              return yield* new NotFound({ message: "Conversation not found" });
            }
            const messages = (yield* getConversationMessages(conversationDb, user.id, params.id))
              .map(rowToMessage)
              .filter((message) => message.role !== "summary")
              .map((message) => ({
                role: message.role,
                text: textFromMessageParts(message.parts),
              }))
              .filter((message) => message.text.trim() !== "");
            if (messages.length === 0) {
              return yield* new BadRequest({ message: "Conversation has no text to compact" });
            }
            const summary = yield* Effect.promise(() =>
              generateConversationSummary({
                configuration: {
                  apiKey: payload.apiKey,
                  baseUrl: payload.baseUrl,
                  model: payload.model,
                },
                messages,
              }),
            );
            const title = conversation.title?.trim() || "New chat";
            const compactedId = yield* createConversation(
              conversationDb,
              user.id,
              `${title} (compacted)`,
            );
            yield* saveConversationMessages(conversationDb, user.id, compactedId, null, [
              {
                role: "system",
                parts: [
                  {
                    type: "text",
                    text: `Use this compacted summary of the previous conversation as context:\n\n${summary}`,
                  },
                ],
              },
            ]);
            const compactedConversation = yield* getConversation(
              conversationDb,
              user.id,
              compactedId,
            );
            if (compactedConversation === null) {
              return yield* new NotFound({ message: "Compacted conversation not found" });
            }
            return { conversation: toApiConversation(compactedConversation) };
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "messages",
        Effect.fn("httpApi.conversations.messages")(
          function* ({ params }) {
            const user = yield* CurrentUser;
            const conversation = yield* getConversation(conversationDb, user.id, params.id);
            if (conversation === null) {
              return yield* new NotFound({ message: "Conversation not found" });
            }
            const rows = yield* getConversationMessages(conversationDb, user.id, params.id);
            const threads = yield* getThreadsIncludingDiscarded(conversationDb, user.id, params.id);
            const threadsWithMessages = yield* Effect.forEach(
              threads,
              (thread) =>
                getThreadMessages(conversationDb, user.id, thread.id).pipe(
                  Effect.map((messages) =>
                    toApiThreadWithMessages({
                      thread,
                      messageIds: messages.map((message) => message.id),
                    }),
                  ),
                ),
              { concurrency: 8 },
            );
            return {
              conversation: toApiConversation(conversation),
              messages: rows.map(rowToMessage),
              threads: threadsWithMessages,
            };
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "rename",
        Effect.fn("httpApi.conversations.rename")(
          function* ({ params, payload }) {
            const user = yield* CurrentUser;
            const title = payload.title.trim();
            yield* renameConversation(conversationDb, user.id, params.id, title);
            return { success: true } as const;
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "threads",
        Effect.fn("httpApi.conversations.threads")(
          function* ({ params }) {
            const user = yield* CurrentUser;
            const threads = yield* getThreads(conversationDb, user.id, params.id);
            return { threads: threads.map(toApiThread) };
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "forkThread",
        Effect.fn("httpApi.conversations.forkThread")(
          function* ({ params, payload }) {
            const user = yield* CurrentUser;
            const anchor = yield* getMessage(conversationDb, user.id, payload.anchorMessageId);
            if (anchor === null || anchor.conversation_id !== params.id) {
              return yield* new NotFound({ message: "Anchor message not found" });
            }
            const existing = yield* getThreadByAnchor(
              conversationDb,
              user.id,
              params.id,
              payload.anchorMessageId,
            );
            if (existing !== null && existing.status === "discarded") {
              yield* restoreThread(conversationDb, user.id, existing.id);
            }
            const id =
              existing?.id ??
              (yield* createThread(
                conversationDb,
                user.id,
                params.id,
                payload.anchorMessageId,
                payload.title?.trim(),
              ));
            if (id === null) {
              return yield* new NotFound({ message: "Thread not found" });
            }
            const thread = yield* getThread(conversationDb, user.id, id);
            if (thread === null) {
              return yield* new NotFound({ message: "Thread not found" });
            }
            return toApiThreadWithMessages({
              thread,
              messageIds: [thread.anchor_message_id],
            });
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "recordDiagnosticEvent",
        Effect.fn("httpApi.conversations.recordDiagnosticEvent")(
          function* ({ params, payload }) {
            const user = yield* CurrentUser;
            const generation = yield* getGeneration({
              db,
              userId: user.id,
              generationId: payload.generationId,
            });
            if (generation === null || generation.conversation_id !== params.id) {
              return yield* new NotFound({ message: "Generation not found" });
            }
            yield* recordChatEvent({
              db,
              userId: user.id,
              conversationId: params.id,
              generationId: generation.id,
              requestId: generation.request_id,
              traceId: generation.trace_id,
              type: payload.type,
              payload: payload.payload ?? {},
            });
            return { recorded: true } as const;
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "reviseMessage",
        Effect.fn("httpApi.conversations.reviseMessage")(
          function* ({ params, payload }) {
            const user = yield* CurrentUser;
            const validated = yield* Effect.promise(() =>
              safeValidateUIMessages({
                messages: [{ id: params.messageId, role: "user", parts: payload.parts }],
              }),
            );
            if (!validated.success) {
              return yield* new BadRequest({ message: validated.error.message });
            }
            const revised = yield* reviseConversationMessage({
              db: conversationDb,
              userId: user.id,
              conversationId: params.id,
              messageId: params.messageId,
              parts: validated.data[0]?.parts ?? [],
              threadId: payload.threadId,
            });
            if (!revised) {
              return yield* new NotFound({ message: "Message not found" });
            }
            return { ok: true } as const;
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      ),
  );
};

export const threadsHandlers = ({
  db,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<never>;
}) => {
  const conversationDb = narrowQueryDatabaseClient<ConversationDatabaseSchema>(db);
  return HttpApiBuilder.group(CoreApi, "threads", (handlers) =>
    handlers
      .handle(
        "read",
        Effect.fn("httpApi.threads.read")(
          function* ({ params }) {
            const user = yield* CurrentUser;
            const thread = yield* getThread(conversationDb, user.id, params.id);
            if (thread === null) {
              return yield* new NotFound({ message: "Thread not found" });
            }
            const rows = yield* getThreadMessages(conversationDb, user.id, params.id);
            return { thread: toApiThread(thread), messages: rows.map(rowToMessage) };
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "update",
        Effect.fn("httpApi.threads.update")(
          function* ({ params, payload }) {
            const user = yield* CurrentUser;
            if (payload.title !== undefined && payload.title.trim() !== "") {
              yield* renameThread(conversationDb, user.id, params.id, payload.title.trim());
            }
            if (payload.pinned !== undefined) {
              yield* pinThread(conversationDb, user.id, params.id, payload.pinned);
            }
            if (payload.status === "discarded") {
              yield* discardThread(conversationDb, user.id, params.id);
            }
            if (payload.status === "regular") {
              yield* restoreThread(conversationDb, user.id, params.id);
            }
            return { success: true } as const;
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      ),
  );
};

export const messagesHandlers = ({
  db,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<never>;
}) => {
  const conversationDb = narrowQueryDatabaseClient<ConversationDatabaseSchema>(db);
  return HttpApiBuilder.group(CoreApi, "messages", (handlers) =>
    handlers.handle(
      "read",
      Effect.fn("httpApi.messages.read")(
        function* ({ params }) {
          const user = yield* CurrentUser;
          const message = yield* getMessage(conversationDb, user.id, params.id);
          if (message === null) {
            return yield* new NotFound({ message: "Message not found" });
          }
          return { message: rowToMessage(message) };
        },
        withInternalError,
        Effect.provide(runtimeContext),
      ),
    ),
  );
};

export const memoryExtractionHandlers = ({
  db,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<never>;
}) => {
  const memoryDb = narrowQueryDatabaseClient<MemoryDatabaseSchema>(db);
  return HttpApiBuilder.group(CoreApi, "memoryExtraction", (handlers) =>
    handlers.handle(
      "extract",
      Effect.fn("httpApi.memoryExtraction.extract")(
        function* ({ payload }) {
          const user = yield* CurrentUser;
          const text = payload.text.trim();
          const existingIds =
            payload.messageId === undefined
              ? []
              : yield* listMemoryIdsForMessage(memoryDb, user.id, payload.messageId);
          if (existingIds.length > 0) return { ids: existingIds, count: 0 };
          const existingMemories = yield* getMemories(memoryDb, user.id, { limit: 60 });
          const snippets = yield* Effect.promise(() =>
            extractMemories({
              configuration: payload.config,
              text,
              existingMemories: existingMemories.map((memory) => memory.content),
            }),
          );
          const ids = yield* insertMemories(
            memoryDb,
            user.id,
            snippets.map((content) => ({
              content,
              source: payload.source ?? "manual",
              threadId: payload.threadId,
              messageId: payload.messageId,
            })),
          );
          if (ids.length > 0) {
            yield* refreshMemorySummary({
              db: memoryDb,
              userId: user.id,
              config: payload.config,
            }).pipe(Effect.catch(() => Effect.void));
          }
          return { ids, count: ids.length };
        },
        withInternalError,
        Effect.provide(runtimeContext),
      ),
    ),
  );
};
