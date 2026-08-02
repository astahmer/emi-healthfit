import { ConversationDatabase } from "./db/conversations.ts";
import * as Effect from "effect/Effect";
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
    const databaseLayer = ConversationDatabase.layer({ db });
    const provideDatabase = <A>(effect: Effect.Effect<A, never, ConversationDatabase>) =>
      Effect.provide(effect, databaseLayer);
    return {
      conversationReader: {
        get: (conversationId) =>
          provideDatabase(ConversationDatabase.getConversation({ userId, conversationId })),
        list: (search) =>
          provideDatabase(ConversationDatabase.getConversations({ userId, search })).pipe(
            Effect.map((conversations) => [...conversations]),
          ),
      },
      conversationWriter: {
        create: (title) =>
          provideDatabase(ConversationDatabase.createConversation({ userId, title })),
        delete: (conversationId) =>
          provideDatabase(ConversationDatabase.deleteConversation({ userId, conversationId })),
        rename: ({ conversationId, title }) =>
          provideDatabase(
            ConversationDatabase.renameConversation({ userId, conversationId, title }),
          ),
        updateState: ({ conversationId, status, pinned }) =>
          provideDatabase(
            ConversationDatabase.updateConversationState({
              userId,
              conversationId,
              status,
              pinned,
            }),
          ),
        clone: (conversationId) =>
          provideDatabase(ConversationDatabase.cloneConversation({ userId, conversationId })),
      },
      messageStore: {
        saveMessages: ({ conversationId, parentId, messages }) =>
          provideDatabase(
            ConversationDatabase.saveConversationMessages({
              userId,
              conversationId,
              parentId,
              messages,
            }),
          ).pipe(Effect.map((ids) => [...ids])),
        getMessages: (conversationId) =>
          provideDatabase(
            ConversationDatabase.getConversationMessages({ userId, conversationId }),
          ).pipe(Effect.map((messages) => [...messages])),
      },
      threadStore: {
        createThread: ({ conversationId, anchorMessageId, title }) =>
          provideDatabase(
            ConversationDatabase.createThread({
              userId,
              conversationId,
              anchorMessageId,
              title,
            }),
          ),
        addThreadMessage: ({ threadId, messageId }) =>
          provideDatabase(ConversationDatabase.addThreadMessage({ userId, threadId, messageId })),
        list: (conversationId) =>
          provideDatabase(ConversationDatabase.getThreads({ userId, conversationId })).pipe(
            Effect.map((threads) => [...threads]),
          ),
        getThread: (threadId) =>
          provideDatabase(ConversationDatabase.getThread({ userId, threadId })),
        getMessages: (threadId) =>
          provideDatabase(ConversationDatabase.getThreadMessages({ userId, threadId })).pipe(
            Effect.map((messages) => [...messages]),
          ),
        rename: ({ threadId, title }) =>
          provideDatabase(ConversationDatabase.renameThread({ userId, threadId, title })),
        setPinned: ({ threadId, pinned }) =>
          provideDatabase(ConversationDatabase.pinThread({ userId, threadId, pinned })),
        discard: (threadId) =>
          provideDatabase(ConversationDatabase.discardThread({ userId, threadId })),
        restore: (threadId) =>
          provideDatabase(ConversationDatabase.restoreThread({ userId, threadId })),
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
