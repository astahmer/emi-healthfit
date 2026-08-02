import { ConversationDatabase } from "./db/conversations.ts";
import * as Layer from "effect/Layer";
import type { QueryDatabaseClient } from "./db/query-database.ts";
import type { ConversationDatabaseSchema } from "./db/schema.ts";
import {
  ConversationReader,
  ConversationWriter,
  MessageStore,
  ThreadStore,
} from "./ports/conversation-store.ts";
import type {
  ConversationReaderShape,
  ConversationWriterShape,
  MessageStoreShape,
  ThreadStoreShape,
} from "./ports/conversation-store.ts";
import type { RequestContext } from "./request-context.ts";

export class ConversationStoreLive {
  static shapes<TEnvironment>({
    db,
    requestContext,
  }: {
    db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
    requestContext: RequestContext;
  }): {
    conversationReader: ConversationReaderShape<TEnvironment>;
    conversationWriter: ConversationWriterShape<TEnvironment>;
    messageStore: MessageStoreShape<TEnvironment>;
    threadStore: ThreadStoreShape<TEnvironment>;
  } {
    const userId = requestContext.userId;
    return {
      conversationReader: {
        get: (conversationId) => ConversationDatabase.getConversation(db, userId, conversationId),
        list: (search) => ConversationDatabase.getConversations(db, userId, search),
      },
      conversationWriter: {
        create: (title) => ConversationDatabase.createConversation(db, userId, title),
        delete: (conversationId) =>
          ConversationDatabase.deleteConversation(db, userId, conversationId),
        rename: ({ conversationId, title }) =>
          ConversationDatabase.renameConversation(db, userId, conversationId, title),
        updateState: ({ conversationId, status, pinned }) =>
          ConversationDatabase.updateConversationState({
            db,
            userId,
            conversationId,
            status,
            pinned,
          }),
        clone: (conversationId) =>
          ConversationDatabase.cloneConversation({ db, userId, conversationId }),
      },
      messageStore: {
        saveMessages: ({ conversationId, parentId, messages }) =>
          ConversationDatabase.saveConversationMessages(
            db,
            userId,
            conversationId,
            parentId,
            messages,
          ),
        getMessages: (conversationId) =>
          ConversationDatabase.getConversationMessages(db, userId, conversationId),
      },
      threadStore: {
        createThread: ({ conversationId, anchorMessageId, title }) =>
          ConversationDatabase.createThread(db, userId, conversationId, anchorMessageId, title),
        addThreadMessage: ({ threadId, messageId }) =>
          ConversationDatabase.addThreadMessage(db, userId, threadId, messageId),
        list: (conversationId) => ConversationDatabase.getThreads(db, userId, conversationId),
        getThread: (threadId) => ConversationDatabase.getThread(db, userId, threadId),
        getMessages: (threadId) => ConversationDatabase.getThreadMessages(db, userId, threadId),
        rename: ({ threadId, title }) =>
          ConversationDatabase.renameThread(db, userId, threadId, title),
        setPinned: ({ threadId, pinned }) =>
          ConversationDatabase.pinThread(db, userId, threadId, pinned),
        discard: (threadId) => ConversationDatabase.discardThread(db, userId, threadId),
        restore: (threadId) => ConversationDatabase.restoreThread(db, userId, threadId),
      },
    };
  }

  static layer({
    db,
    requestContext,
  }: {
    db: QueryDatabaseClient<ConversationDatabaseSchema>;
    requestContext: RequestContext;
  }): Layer.Layer<ConversationReader | ConversationWriter | MessageStore | ThreadStore> {
    const shapes = this.shapes({ db, requestContext });
    return Layer.mergeAll(
      Layer.succeed(ConversationReader, shapes.conversationReader),
      Layer.succeed(ConversationWriter, shapes.conversationWriter),
      Layer.succeed(MessageStore, shapes.messageStore),
      Layer.succeed(ThreadStore, shapes.threadStore),
    );
  }
}
