import { CompactConversationRequestSchema, CompactedSummarySchema } from "../chat/request.ts";
import { OpenAiChat } from "../adapters/ai-sdk/openai-chat.ts";
import { CurrentUser } from "../server/auth/principal.ts";
import { ConversationDatabase } from "../server/db/conversations.ts";
import { MemoryDatabase } from "../server/db/memories.ts";
import type { ConversationDatabaseSchema, MemoryDatabaseSchema } from "../server/db/schema.ts";
import { ConversationStoreLive } from "../server/make-conversation-store.ts";
import { makeRequestContext } from "../server/request-context.ts";
import {
  deleteAttachmentObjectsEffect,
  type ReadWriteBucketClient,
} from "./chat-attachment-storage.ts";
import { ChatRouteSupport } from "./chat-route-support.ts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import type { CloudflareQueryDatabaseClient } from "./db/client.ts";

export class ChatRouteConversation {
  static make({
    db,
    memoryDb,
    attachmentsBucket,
  }: {
    readonly db: CloudflareQueryDatabaseClient<ConversationDatabaseSchema>;
    readonly memoryDb: CloudflareQueryDatabaseClient<MemoryDatabaseSchema>;
    readonly attachmentsBucket?: ReadWriteBucketClient;
  }) {
    const databaseLayer = ConversationDatabase.layer({ db });
    const memoryDatabaseLayer = MemoryDatabase.layer({ db: memoryDb });
    const storeFor = (userId: string) =>
      ConversationStoreLive.effect({
        requestContext: makeRequestContext({ userId }),
      }).pipe(Effect.provide(databaseLayer));

    const conversations = Effect.fn("core.chat.conversations")(function* (
      request: HttpServerRequest,
    ) {
      const user = yield* CurrentUser;
      const store = yield* storeFor(user.id);
      if (request.method === "POST") {
        const id = yield* store.conversationWriter.create();
        return yield* HttpServerResponse.json({ id }, { status: 201 });
      }
      const search =
        new URL(request.url, "http://localhost").searchParams.get("search") ?? undefined;
      const values = yield* store.conversationReader.list(search);
      return yield* HttpServerResponse.json({
        conversations: values.map(ChatRouteSupport.conversationResponse),
      });
    });

    const conversation = Effect.fn("core.chat.conversation")(function* (
      request: HttpServerRequest,
    ) {
      const user = yield* CurrentUser;
      const store = yield* storeFor(user.id);
      const params = yield* HttpRouter.params;
      const conversationId = params.conversationId;
      if (conversationId === undefined) {
        return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      const existing = yield* store.conversationReader.get(conversationId);
      if (existing === null) {
        return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      if (request.method === "GET") {
        const messages = yield* store.messageStore.getMessages(conversationId);
        return yield* HttpServerResponse.json({
          conversation: ChatRouteSupport.conversationResponse(existing),
          messages: messages.map(ChatRouteSupport.messageResponse),
        });
      }
      if (request.method === "DELETE") {
        const messages = yield* store.messageStore.getMessages(conversationId);
        yield* Effect.gen(function* () {
          const threads = yield* store.threadStore.list(conversationId);
          const memoryDatabase = yield* MemoryDatabase;
          yield* memoryDatabase.softDeleteMemories({
            userId: user.id,
            messageIds: messages.map((message) => message.id),
            threadIds: threads.map((thread) => thread.id),
          });
        }).pipe(Effect.provide(memoryDatabaseLayer));
        yield* store.conversationWriter.delete(conversationId);
        if (attachmentsBucket !== undefined) {
          yield* deleteAttachmentObjectsEffect({
            userId: user.id,
            bucket: attachmentsBucket,
            messages,
          }).pipe(
            Effect.catch((error) =>
              Effect.logWarning("chat.attachments.delete-failed").pipe(
                Effect.annotateLogs({ conversationId, error: String(error) }),
                Effect.as(0),
              ),
            ),
          );
        }
        return yield* HttpServerResponse.json({ deleted: true });
      }

      const decoded = Schema.decodeUnknownOption(ChatRouteSupport.conversationActionSchema)(
        yield* request.json,
      );
      if (Option.isNone(decoded)) {
        return yield* HttpServerResponse.json(
          { error: "Invalid conversation update" },
          { status: 400 },
        );
      }
      if (decoded.value.title !== undefined) {
        yield* store.conversationWriter.rename({
          conversationId,
          title: decoded.value.title,
        });
      }
      yield* store.conversationWriter.updateState({
        conversationId,
        status: decoded.value.status,
        pinned: decoded.value.pinned,
      });
      const updated = yield* store.conversationReader.get(conversationId);
      if (updated === null) {
        return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      return yield* HttpServerResponse.json({
        conversation: ChatRouteSupport.conversationResponse(updated),
      });
    });

    const clone = Effect.fn("core.chat.conversation.clone")(function* () {
      const user = yield* CurrentUser;
      const store = yield* storeFor(user.id);
      const params = yield* HttpRouter.params;
      const conversationId = params.conversationId;
      if (conversationId === undefined) {
        return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      const cloned = yield* store.conversationWriter.clone(conversationId);
      if (cloned === null) {
        return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      return yield* HttpServerResponse.json(
        { conversation: ChatRouteSupport.conversationResponse(cloned) },
        { status: 201 },
      );
    });

    const compact = Effect.fn("core.chat.conversation.compact")(function* (
      request: HttpServerRequest,
    ) {
      const user = yield* CurrentUser;
      const store = yield* storeFor(user.id);
      const params = yield* HttpRouter.params;
      const conversationId = params.conversationId;
      if (conversationId === undefined) {
        return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      const existingConversation = yield* store.conversationReader.get(conversationId);
      if (existingConversation === null) {
        return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      const decoded = Schema.decodeUnknownOption(CompactConversationRequestSchema)(
        yield* request.json,
      );
      if (Option.isNone(decoded)) {
        return yield* HttpServerResponse.json(
          { error: "Invalid compaction request" },
          { status: 400 },
        );
      }
      const messages = (yield* store.messageStore.getMessages(conversationId)).flatMap(
        (message) => {
          if (message.role === "summary") return [];
          const text = ChatRouteSupport.storedMessageText({ parts: message.parts });
          return text === "" ? [] : [{ role: message.role, text }];
        },
      );
      if (messages.length === 0) {
        return yield* HttpServerResponse.json(
          { error: "Conversation has no text to compact" },
          { status: 400 },
        );
      }
      const summary = yield* OpenAiChat.generateConversationSummaryEffect({
        configuration: decoded.value.config,
        messages,
      });
      if (summary === "") {
        return yield* HttpServerResponse.json(
          { error: "Unable to compact conversation" },
          { status: 502 },
        );
      }
      const title = existingConversation.title?.trim() || "New chat";
      const compactedId = yield* store.conversationWriter.create(`${title} (compacted)`);
      yield* store.messageStore.saveMessages({
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
      const compacted = yield* store.conversationReader.get(compactedId);
      if (compacted === null) {
        return yield* HttpServerResponse.json(
          { error: "Compacted conversation not found" },
          { status: 404 },
        );
      }
      return yield* HttpServerResponse.json(
        {
          conversation: ChatRouteSupport.conversationResponse(compacted),
          summary: Schema.decodeUnknownSync(CompactedSummarySchema)({
            content: summary,
            sourceConversationId: conversationId,
          }),
        },
        { status: 201 },
      );
    });

    const threads = Effect.fn("core.chat.threads")(function* (request: HttpServerRequest) {
      const user = yield* CurrentUser;
      const store = yield* storeFor(user.id);
      const params = yield* HttpRouter.params;
      const conversationId = params.conversationId;
      if (conversationId === undefined) {
        return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      const existingConversation = yield* store.conversationReader.get(conversationId);
      if (existingConversation === null) {
        return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      if (request.method === "GET") {
        const values = yield* store.threadStore.list(conversationId);
        return yield* HttpServerResponse.json({
          threads: values.map(ChatRouteSupport.threadResponse),
        });
      }
      const decoded = Schema.decodeUnknownOption(ChatRouteSupport.createThreadSchema)(
        yield* request.json,
      );
      if (Option.isNone(decoded)) {
        return yield* HttpServerResponse.json({ error: "Invalid thread" }, { status: 400 });
      }
      const id = yield* store.threadStore.createThread({
        conversationId,
        anchorMessageId: decoded.value.anchorMessageId,
        title: decoded.value.title,
      });
      if (id === null) {
        return yield* HttpServerResponse.json(
          { error: "Anchor message not found" },
          { status: 404 },
        );
      }
      const thread = yield* store.threadStore.getThread(id);
      if (thread === null) {
        return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
      }
      return yield* HttpServerResponse.json(
        { thread: ChatRouteSupport.threadResponse(thread) },
        { status: 201 },
      );
    });

    const thread = Effect.fn("core.chat.thread")(function* (request: HttpServerRequest) {
      const user = yield* CurrentUser;
      const store = yield* storeFor(user.id);
      const params = yield* HttpRouter.params;
      const conversationId = params.conversationId;
      const threadId = params.threadId;
      if (conversationId === undefined || threadId === undefined) {
        return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
      }
      const existing = yield* store.threadStore.getThread(threadId);
      if (existing === null || existing.conversation_id !== conversationId) {
        return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
      }
      if (request.method === "GET") {
        const [conversationMessages, branchMessages] = yield* Effect.all([
          store.messageStore.getMessages(conversationId),
          store.threadStore.getMessages(threadId),
        ]);
        const anchor = conversationMessages.find(
          (message) => message.id === existing.anchor_message_id,
        );
        const contextMessages =
          anchor === undefined
            ? []
            : conversationMessages.filter(
                (message) => message.parent_id === null && message.created_at <= anchor.created_at,
              );
        const messages = [
          ...new Map(
            [...contextMessages, ...branchMessages].map((message) => [message.id, message]),
          ).values(),
        ].toSorted((left, right) => left.created_at.localeCompare(right.created_at));
        return yield* HttpServerResponse.json({
          thread: ChatRouteSupport.threadResponse(existing),
          messages: messages.map(ChatRouteSupport.messageResponse),
        });
      }
      if (request.method === "DELETE") {
        yield* store.threadStore.discard(threadId);
        return yield* HttpServerResponse.json({ deleted: true });
      }
      const decoded = Schema.decodeUnknownOption(ChatRouteSupport.threadActionSchema)(
        yield* request.json,
      );
      if (Option.isNone(decoded)) {
        return yield* HttpServerResponse.json({ error: "Invalid thread update" }, { status: 400 });
      }
      if (decoded.value.title !== undefined) {
        yield* store.threadStore.rename({ threadId, title: decoded.value.title });
      }
      if (decoded.value.pinned !== undefined) {
        yield* store.threadStore.setPinned({ threadId, pinned: decoded.value.pinned });
      }
      if (decoded.value.status === "discarded") {
        yield* store.threadStore.discard(threadId);
      }
      if (decoded.value.status === "regular") {
        yield* store.threadStore.restore(threadId);
      }
      const updated = yield* store.threadStore.getThread(threadId);
      if (updated === null) {
        return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
      }
      return yield* HttpServerResponse.json({
        thread: ChatRouteSupport.threadResponse(updated),
      });
    });

    return { conversations, conversation, clone, compact, threads, thread };
  }
}
