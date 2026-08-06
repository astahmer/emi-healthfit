import {
  BadRequest,
  CoreApi,
  NotFound,
  type Conversation as ApiConversation,
  type Message as ApiMessage,
  type Thread as ApiThread,
  type ThreadWithMessages as ApiThreadWithMessages,
} from "@emi/core/contract";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Chat } from "@emi/core/chat";
import { Cloudflare as CoreCloudflare, type ReadWriteBucketClient } from "@emi/core/cloudflare";
import { ServerDatabase } from "@emi/core/server/database";
import { decodeMessageParts, textFromMessageParts } from "./codecs.ts";
import { withInternalError } from "../../platform/http/errors.ts";
import { maxStoredMessagePartsBytes, messagePartsJsonBytes } from "../attachment-policy.ts";

type Conversation = ServerDatabase.Conversation;
type Thread = ServerDatabase.Thread;

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
  attachmentsBucket,
}: {
  attachmentsBucket: ReadWriteBucketClient;
}) => {
  return HttpApiBuilder.group(CoreApi, "conversations", (handlers) =>
    Effect.gen(function* () {
      const ConversationDatabase = yield* ServerDatabase.conversations;
      const GenerationDatabase = yield* ServerDatabase.generations;
      const MemoryDatabase = yield* ServerDatabase.memories;
      return handlers
        .handle(
          "list",
          Effect.fn("httpApi.conversations.list")(function* ({ query }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const conversations = yield* ConversationDatabase.getConversations({
              userId: user.id,
              search: query.search,
            });
            return { conversations: conversations.map(toApiConversation) };
          }, withInternalError),
        )
        .handle(
          "create",
          Effect.fn("httpApi.conversations.create")(function* () {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const id = yield* ConversationDatabase.createConversation({ userId: user.id });
            return { id };
          }, withInternalError),
        )
        .handle(
          "createWithMessages",
          Effect.fn("httpApi.conversations.createWithMessages")(function* ({ payload }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            if (payload.messages.length === 0) {
              return yield* new BadRequest({
                message: "Conversation requires at least one message",
              });
            }
            const validated = yield* Chat.messages.validateUIMessagesEffect(
              payload.messages.map((message, index) => ({
                id: `import-${index}`,
                role: message.role,
                parts: Chat.messages.fromProtocolMessage({
                  id: `import-${index}`,
                  role: message.role,
                  parts: message.parts,
                }).parts,
              })),
            );
            if (!validated.success) {
              return yield* new BadRequest({ message: validated.error.message });
            }
            const uiMessages = validated.data;
            const persistedMessages =
              yield* CoreCloudflare.attachments.externalizeMessageAttachmentsEffect({
                userId: user.id,
                messages: uiMessages,
                bucket: attachmentsBucket,
              });
            if (
              persistedMessages.some(
                (message) => messagePartsJsonBytes(message.parts) > maxStoredMessagePartsBytes,
              )
            ) {
              return yield* new BadRequest({
                message: "Message is too large to store",
              });
            }
            const id = yield* ConversationDatabase.createConversation({
              userId: user.id,
              title: payload.title?.trim(),
            });
            yield* ConversationDatabase.saveConversationMessages({
              userId: user.id,
              conversationId: id,
              parentId: null,
              messages: persistedMessages.map((message) => ({
                role: message.role,
                parts: [...message.parts],
              })),
            });
            const conversation = yield* ConversationDatabase.getConversation({
              userId: user.id,
              conversationId: id,
            });
            if (conversation === null) {
              return yield* new NotFound({ message: "Conversation not found" });
            }
            return { conversation: toApiConversation(conversation) };
          }, withInternalError),
        )
        .handle(
          "remove",
          Effect.fn("httpApi.conversations.remove")(function* ({ params }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const messages = yield* ConversationDatabase.getConversationMessages({
              userId: user.id,
              conversationId: params.id,
            });
            const threads = yield* ConversationDatabase.getThreads({
              userId: user.id,
              conversationId: params.id,
            });
            yield* MemoryDatabase.softDeleteMemories({
              userId: user.id,
              messageIds: messages.map((message) => message.id),
              threadIds: threads.map((thread) => thread.id),
            });
            yield* ConversationDatabase.deleteConversation({
              userId: user.id,
              conversationId: params.id,
            });
            yield* CoreCloudflare.attachments
              .deleteAttachmentObjectsEffect({
                userId: user.id,
                bucket: attachmentsBucket,
                messages,
              })
              .pipe(
                Effect.catch((error) =>
                  Effect.logWarning("chat.attachments.delete-failed").pipe(
                    Effect.annotateLogs({ conversationId: params.id, error: String(error) }),
                    Effect.as(0),
                  ),
                ),
              );
            return { success: true } as const;
          }, withInternalError),
        )
        .handle(
          "updateState",
          Effect.fn("httpApi.conversations.updateState")(function* ({ params, payload }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            yield* ConversationDatabase.updateConversationState({
              userId: user.id,
              conversationId: params.id,
              status: payload.status,
              pinned: payload.pinned,
            });
            const conversation = yield* ConversationDatabase.getConversation({
              userId: user.id,
              conversationId: params.id,
            });
            if (conversation === null) {
              return yield* new NotFound({ message: "Conversation not found" });
            }
            return { conversation: toApiConversation(conversation) };
          }, withInternalError),
        )
        .handle(
          "clone",
          Effect.fn("httpApi.conversations.clone")(function* ({ params }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const conversation = yield* ConversationDatabase.cloneConversation({
              userId: user.id,
              conversationId: params.id,
            });
            if (conversation === null) {
              return yield* new NotFound({ message: "Conversation not found" });
            }
            return { conversation: toApiConversation(conversation) };
          }, withInternalError),
        )
        .handle(
          "compact",
          Effect.fn("httpApi.conversations.compact")(function* ({ params, payload }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const conversation = yield* ConversationDatabase.getConversation({
              userId: user.id,
              conversationId: params.id,
            });
            if (conversation === null) {
              return yield* new NotFound({ message: "Conversation not found" });
            }
            const messages = (yield* ConversationDatabase.getConversationMessages({
              userId: user.id,
              conversationId: params.id,
            }))
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
            const summary = yield* Chat.generation.generateConversationSummaryEffect({
              configuration: {
                apiKey: payload.apiKey,
                baseUrl: payload.baseUrl,
                model: payload.model,
              },
              messages,
            });
            const title = conversation.title?.trim() || "New chat";
            const compactedId = yield* ConversationDatabase.createConversation({
              userId: user.id,
              title: `${title} (compacted)`,
            });
            yield* ConversationDatabase.saveConversationMessages({
              userId: user.id,
              conversationId: compactedId,
              parentId: null,
              messages: [
                {
                  role: "system",
                  parts: [
                    {
                      type: "text",
                      text: `Use this compacted summary of the previous conversation as context:\n\n${summary}`,
                    },
                  ],
                },
              ],
            });
            const compactedConversation = yield* ConversationDatabase.getConversation({
              userId: user.id,
              conversationId: compactedId,
            });
            if (compactedConversation === null) {
              return yield* new NotFound({ message: "Compacted conversation not found" });
            }
            return { conversation: toApiConversation(compactedConversation) };
          }, withInternalError),
        )
        .handle(
          "messages",
          Effect.fn("httpApi.conversations.messages")(function* ({ params }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const conversation = yield* ConversationDatabase.getConversation({
              userId: user.id,
              conversationId: params.id,
            });
            if (conversation === null) {
              return yield* new NotFound({ message: "Conversation not found" });
            }
            const rows = yield* ConversationDatabase.getConversationMessages({
              userId: user.id,
              conversationId: params.id,
            });
            const threads = yield* ConversationDatabase.getThreadsIncludingDiscarded({
              userId: user.id,
              conversationId: params.id,
            });
            const threadsWithMessages = yield* Effect.forEach(
              threads,
              (thread) =>
                ConversationDatabase.getThreadMessages({
                  userId: user.id,
                  threadId: thread.id,
                }).pipe(
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
          }, withInternalError),
        )
        .handle(
          "rename",
          Effect.fn("httpApi.conversations.rename")(function* ({ params, payload }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const title = payload.title.trim();
            yield* ConversationDatabase.renameConversation({
              userId: user.id,
              conversationId: params.id,
              title,
            });
            return { success: true } as const;
          }, withInternalError),
        )
        .handle(
          "threads",
          Effect.fn("httpApi.conversations.threads")(function* ({ params }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const threads = yield* ConversationDatabase.getThreads({
              userId: user.id,
              conversationId: params.id,
            });
            return { threads: threads.map(toApiThread) };
          }, withInternalError),
        )
        .handle(
          "forkThread",
          Effect.fn("httpApi.conversations.forkThread")(function* ({ params, payload }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const anchor = yield* ConversationDatabase.getMessage({
              userId: user.id,
              messageId: payload.anchorMessageId,
            });
            if (anchor === null || anchor.conversation_id !== params.id) {
              return yield* new NotFound({ message: "Anchor message not found" });
            }
            const existing = yield* ConversationDatabase.getThreadByAnchor({
              userId: user.id,
              conversationId: params.id,
              anchorMessageId: payload.anchorMessageId,
            });
            if (existing !== null && existing.status === "discarded") {
              yield* ConversationDatabase.restoreThread({ userId: user.id, threadId: existing.id });
            }
            const id =
              existing?.id ??
              (yield* ConversationDatabase.createThread({
                userId: user.id,
                conversationId: params.id,
                anchorMessageId: payload.anchorMessageId,
                title: payload.title?.trim(),
              }));
            if (id === null) {
              return yield* new NotFound({ message: "Thread not found" });
            }
            const thread = yield* ConversationDatabase.getThread({
              userId: user.id,
              threadId: id,
            });
            if (thread === null) {
              return yield* new NotFound({ message: "Thread not found" });
            }
            return toApiThreadWithMessages({
              thread,
              messageIds: [thread.anchor_message_id],
            });
          }, withInternalError),
        )
        .handle(
          "recordDiagnosticEvent",
          Effect.fn("httpApi.conversations.recordDiagnosticEvent")(function* ({ params, payload }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const generation = yield* GenerationDatabase.getGeneration({
              userId: user.id,
              generationId: payload.generationId,
            });
            if (generation === null || generation.conversation_id !== params.id) {
              return yield* new NotFound({ message: "Generation not found" });
            }
            yield* GenerationDatabase.recordChatEvent({
              userId: user.id,
              conversationId: params.id,
              generationId: generation.id,
              requestId: generation.request_id,
              traceId: generation.trace_id,
              type: payload.type,
              payload: payload.payload ?? {},
            });
            return { recorded: true } as const;
          }, withInternalError),
        )
        .handle(
          "reviseMessage",
          Effect.fn("httpApi.conversations.reviseMessage")(function* ({ params, payload }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const validated = yield* Chat.messages.validateUIMessagesEffect([
              {
                id: params.messageId,
                role: "user",
                parts: Chat.messages.fromProtocolMessage({
                  id: params.messageId,
                  role: "user",
                  parts: payload.parts,
                }).parts,
              },
            ]);
            if (!validated.success) {
              return yield* new BadRequest({ message: validated.error.message });
            }
            const [persistedMessage] =
              yield* CoreCloudflare.attachments.externalizeMessageAttachmentsEffect({
                userId: user.id,
                messages: validated.data,
                bucket: attachmentsBucket,
              });
            if (
              persistedMessage !== undefined &&
              messagePartsJsonBytes(persistedMessage.parts) > maxStoredMessagePartsBytes
            ) {
              return yield* new BadRequest({
                message: "Message is too large to store",
              });
            }
            const revised = yield* ConversationDatabase.reviseConversationMessage({
              userId: user.id,
              conversationId: params.id,
              messageId: params.messageId,
              parts: [...(persistedMessage?.parts ?? payload.parts)],
              threadId: payload.threadId,
            });
            if (!revised) {
              return yield* new NotFound({ message: "Message not found" });
            }
            return { ok: true } as const;
          }, withInternalError),
        );
    }),
  );
};

export const threadsHandlers = () => {
  return HttpApiBuilder.group(CoreApi, "threads", (handlers) =>
    Effect.gen(function* () {
      const ConversationDatabase = yield* ServerDatabase.conversations;
      return handlers

        .handle(
          "read",
          Effect.fn("httpApi.threads.read")(function* ({ params }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            const thread = yield* ConversationDatabase.getThread({
              userId: user.id,
              threadId: params.id,
            });
            if (thread === null) {
              return yield* new NotFound({ message: "Thread not found" });
            }
            const rows = yield* ConversationDatabase.getThreadMessages({
              userId: user.id,
              threadId: params.id,
            });
            const conversationRows = yield* ConversationDatabase.getConversationMessages({
              userId: user.id,
              conversationId: thread.conversation_id,
            });
            const latestSummary = conversationRows.filter((row) => row.role === "summary").at(-1);
            const messages = latestSummary === undefined ? rows : [...rows, latestSummary];
            return { thread: toApiThread(thread), messages: messages.map(rowToMessage) };
          }, withInternalError),
        )
        .handle(
          "update",
          Effect.fn("httpApi.threads.update")(function* ({ params, payload }) {
            const user = yield* CoreCloudflare.user.CurrentUser;
            if (payload.title !== undefined && payload.title.trim() !== "") {
              yield* ConversationDatabase.renameThread({
                userId: user.id,
                threadId: params.id,
                title: payload.title.trim(),
              });
            }
            if (payload.pinned !== undefined) {
              yield* ConversationDatabase.pinThread({
                userId: user.id,
                threadId: params.id,
                pinned: payload.pinned,
              });
            }
            if (payload.status === "discarded") {
              yield* ConversationDatabase.discardThread({ userId: user.id, threadId: params.id });
            }
            if (payload.status === "regular") {
              yield* ConversationDatabase.restoreThread({ userId: user.id, threadId: params.id });
            }
            return { success: true } as const;
          }, withInternalError),
        );
    }),
  );
};

export const messagesHandlers = () => {
  return HttpApiBuilder.group(CoreApi, "messages", (handlers) =>
    Effect.gen(function* () {
      const ConversationDatabase = yield* ServerDatabase.conversations;
      return handlers.handle(
        "read",
        Effect.fn("httpApi.messages.read")(function* ({ params }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
          const message = yield* ConversationDatabase.getMessage({
            userId: user.id,
            messageId: params.id,
          });
          if (message === null) {
            return yield* new NotFound({ message: "Message not found" });
          }
          return { message: rowToMessage(message) };
        }, withInternalError),
      );
    }),
  );
};

export const memoryExtractionHandlers = () => {
  return HttpApiBuilder.group(CoreApi, "memoryExtraction", (handlers) =>
    Effect.gen(function* () {
      const MemoryDatabase = yield* ServerDatabase.memories;
      return handlers.handle(
        "extract",
        Effect.fn("httpApi.memoryExtraction.extract")(function* ({ payload }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
          const text = payload.text.trim();
          const existingIds =
            payload.messageId === undefined
              ? []
              : yield* MemoryDatabase.listMemoryIdsForMessage({
                  userId: user.id,
                  messageId: payload.messageId,
                });
          if (existingIds.length > 0) return { ids: existingIds, count: 0 };
          const existingMemories = yield* MemoryDatabase.getMemories({
            userId: user.id,
            options: { limit: 60 },
          });
          const snippets = yield* Chat.memory.extractMemoriesEffect({
            configuration: payload.config,
            text,
            existingMemories: existingMemories.map((memory) => memory.content),
          });
          const ids = yield* MemoryDatabase.insertMemories({
            userId: user.id,
            inputs: snippets.map((content) => ({
              content,
              source: payload.source ?? "manual",
              threadId: payload.threadId,
              messageId: payload.messageId,
            })),
          });
          if (ids.length > 0) {
            yield* ServerDatabase.memoryContext
              .refreshEffect({
                userId: user.id,
                configuration: payload.config,
              })
              .pipe(Effect.provide(Layer.succeed(ServerDatabase.memories, MemoryDatabase)))
              .pipe(Effect.catch(() => Effect.void));
          }
          return { ids, count: ids.length };
        }, withInternalError),
      );
    }),
  );
};
