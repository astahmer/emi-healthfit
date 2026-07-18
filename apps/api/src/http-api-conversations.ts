import {
  BadRequest,
  EmiApi,
  NotFound,
  type Conversation as ApiConversation,
  type Message as ApiMessage,
  type Thread as ApiThread,
  type ThreadWithMessages as ApiThreadWithMessages,
} from "@emi/api-contract";
import type { RuntimeContext } from "alchemy";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { safeValidateUIMessages } from "ai";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { CurrentUser } from "./auth/request-auth.ts";
import { extractMemories, generateThreadSummary } from "./chat/ai-sdk.ts";
import { getGeneration, recordChatEvent } from "./chat/generation-store.ts";
import {
  type Conversation,
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
  reviseConversationMessage,
  restoreThread,
  saveConversationMessages,
  type Thread,
  updateConversationState,
} from "./db/conversations.ts";
import type { QueryDatabaseClient } from "./db/client.ts";
import { insertMemory } from "./db/memories.ts";
import { decodeMessageParts, textFromMessageParts } from "./http-api-codecs.ts";
import { withInternalError } from "./http-api-errors.ts";

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
  runtimeContext: Context.Context<RuntimeContext>;
}) =>
  HttpApiBuilder.group(EmiApi, "conversations", (handlers) =>
    handlers
      .handle(
        "list",
        Effect.fn("httpApi.conversations.list")(
          function* ({ query }) {
            const user = yield* CurrentUser;
            const conversations = yield* getConversations(db, user.id, query.search);
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
            const user = yield* CurrentUser;
            const id = yield* createConversation(db, user.id);
            return { id };
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
            yield* deleteConversation(db, user.id, params.id);
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
              db,
              userId: user.id,
              conversationId: params.id,
              status: payload.status,
              pinned: payload.pinned,
            });
            const conversation = yield* getConversation(db, user.id, params.id);
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
              db,
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
            const conversation = yield* getConversation(db, user.id, params.id);
            if (conversation === null) {
              return yield* new NotFound({ message: "Conversation not found" });
            }
            const messages = (yield* getConversationMessages(db, user.id, params.id))
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
              generateThreadSummary(payload.apiKey, payload.baseUrl, payload.model, messages),
            );
            const title = conversation.title?.trim() || "New chat";
            const compactedId = yield* createConversation(db, user.id, `${title} (compacted)`);
            yield* saveConversationMessages(db, user.id, compactedId, null, [
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
            const compactedConversation = yield* getConversation(db, user.id, compactedId);
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
            const conversation = yield* getConversation(db, user.id, params.id);
            if (conversation === null) {
              return yield* new NotFound({ message: "Conversation not found" });
            }
            const rows = yield* getConversationMessages(db, user.id, params.id);
            const threads = yield* getThreadsIncludingDiscarded(db, user.id, params.id);
            const threadsWithMessages = yield* Effect.forEach(
              threads,
              (thread) =>
                getThreadMessages(db, user.id, thread.id).pipe(
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
            yield* renameConversation(db, user.id, params.id, title);
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
            const threads = yield* getThreads(db, user.id, params.id);
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
            const anchor = yield* getMessage(db, user.id, payload.anchorMessageId);
            if (anchor === null || anchor.conversation_id !== params.id) {
              return yield* new NotFound({ message: "Anchor message not found" });
            }
            const id = yield* createThread(
              db,
              user.id,
              params.id,
              payload.anchorMessageId,
              payload.title?.trim(),
            );
            const thread = yield* getThread(db, user.id, id);
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
              db,
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

export const threadsHandlers = ({
  db,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<RuntimeContext>;
}) =>
  HttpApiBuilder.group(EmiApi, "threads", (handlers) =>
    handlers
      .handle(
        "read",
        Effect.fn("httpApi.threads.read")(
          function* ({ params }) {
            const user = yield* CurrentUser;
            const thread = yield* getThread(db, user.id, params.id);
            if (thread === null) {
              return yield* new NotFound({ message: "Thread not found" });
            }
            const rows = yield* getThreadMessages(db, user.id, params.id);
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
              yield* renameThread(db, user.id, params.id, payload.title.trim());
            }
            if (payload.pinned !== undefined) {
              yield* pinThread(db, user.id, params.id, payload.pinned);
            }
            if (payload.status === "discarded") {
              yield* discardThread(db, user.id, params.id);
            }
            if (payload.status === "regular") {
              yield* restoreThread(db, user.id, params.id);
            }
            return { success: true } as const;
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      ),
  );

export const messagesHandlers = ({
  db,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<RuntimeContext>;
}) =>
  HttpApiBuilder.group(EmiApi, "messages", (handlers) =>
    handlers.handle(
      "read",
      Effect.fn("httpApi.messages.read")(
        function* ({ params }) {
          const user = yield* CurrentUser;
          const message = yield* getMessage(db, user.id, params.id);
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

export const memoryExtractionHandlers = ({
  db,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<RuntimeContext>;
}) =>
  HttpApiBuilder.group(EmiApi, "memoryExtraction", (handlers) =>
    handlers.handle(
      "extract",
      Effect.fn("httpApi.memoryExtraction.extract")(
        function* ({ payload }) {
          const user = yield* CurrentUser;
          const text = payload.text.trim();
          const snippets = yield* Effect.promise(() =>
            extractMemories(
              payload.config.apiKey,
              payload.config.baseUrl,
              payload.config.model,
              text,
            ),
          );
          const insertedIds = yield* Effect.forEach(
            snippets,
            (snippet) => insertMemory(db, user.id, snippet, "assistant", payload.threadId),
            { concurrency: 8 },
          );
          const ids = insertedIds.filter((id) => id !== null);
          return { ids, count: ids.length };
        },
        withInternalError,
        Effect.provide(runtimeContext),
      ),
    ),
  );
