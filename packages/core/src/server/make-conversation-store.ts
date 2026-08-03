import { ConversationDatabase } from "./db/conversations.ts";
import * as Context from "effect/Context";
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
  static effect({ requestContext }: { requestContext: RequestContext }): Effect.Effect<
    {
      readonly conversationReader: ConversationReaderShape;
      readonly conversationWriter: ConversationWriterShape;
      readonly messageStore: MessageStoreShape;
      readonly threadStore: ThreadStoreShape;
    },
    never,
    ConversationDatabase
  > {
    const userId = requestContext.userId;
    return Effect.gen(function* () {
      const database = yield* ConversationDatabase;
      return {
        conversationReader: {
          get: (conversationId) => database.getConversation({ userId, conversationId }),
          list: (search) =>
            database
              .getConversations({ userId, search })
              .pipe(Effect.map((conversations) => [...conversations])),
          searchMessages: ({ query, excludeConversationId, limit }) =>
            database
              .searchConversationMessages({
                userId,
                query,
                excludeConversationId,
                limit,
              })
              .pipe(Effect.map((results) => [...results])),
        },
        conversationWriter: {
          create: (title) => database.createConversation({ userId, title }),
          delete: (conversationId) => database.deleteConversation({ userId, conversationId }),
          rename: ({ conversationId, title }) =>
            database.renameConversation({ userId, conversationId, title }),
          updateState: ({ conversationId, status, pinned }) =>
            database.updateConversationState({ userId, conversationId, status, pinned }),
          clone: (conversationId) => database.cloneConversation({ userId, conversationId }),
        },
        messageStore: {
          saveMessages: ({ conversationId, parentId, messages }) =>
            database
              .saveConversationMessages({ userId, conversationId, parentId, messages })
              .pipe(Effect.map((ids) => [...ids])),
          getMessages: (conversationId) =>
            database
              .getConversationMessages({ userId, conversationId })
              .pipe(Effect.map((messages) => [...messages])),
          reviseMessage: ({ conversationId, messageId, parts, threadId }) =>
            database.reviseConversationMessage({
              userId,
              conversationId,
              messageId,
              parts,
              threadId,
            }),
        },
        threadStore: {
          createThread: ({ conversationId, anchorMessageId, title }) =>
            database.createThread({ userId, conversationId, anchorMessageId, title }),
          addThreadMessage: ({ threadId, messageId }) =>
            database.addThreadMessage({ userId, threadId, messageId }),
          list: (conversationId) =>
            database
              .getThreads({ userId, conversationId })
              .pipe(Effect.map((threads) => [...threads])),
          getThread: (threadId) => database.getThread({ userId, threadId }),
          getMessages: (threadId) =>
            database
              .getThreadMessages({ userId, threadId })
              .pipe(Effect.map((messages) => [...messages])),
          rename: ({ threadId, title }) => database.renameThread({ userId, threadId, title }),
          setPinned: ({ threadId, pinned }) => database.pinThread({ userId, threadId, pinned }),
          discard: (threadId) => database.discardThread({ userId, threadId }),
          restore: (threadId) => database.restoreThread({ userId, threadId }),
        },
      };
    });
  }

  static layer({
    db,
    requestContext,
  }: {
    db: QueryDatabaseClient<ConversationDatabaseSchema>;
    requestContext: RequestContext;
  }): Layer.Layer<ConversationReader | ConversationWriter | MessageStore | ThreadStore> {
    const databaseLayer = ConversationDatabase.layer({ db });
    const storeContext = this.effect({ requestContext }).pipe(
      Effect.map(({ conversationReader, conversationWriter, messageStore, threadStore }) =>
        Context.make(ConversationReader, conversationReader).pipe(
          Context.add(ConversationWriter, conversationWriter),
          Context.add(MessageStore, messageStore),
          Context.add(ThreadStore, threadStore),
        ),
      ),
      Effect.provide(databaseLayer),
    );
    return Layer.effectContext(storeContext);
  }
}
