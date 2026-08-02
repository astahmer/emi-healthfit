import { ConversationDatabase } from "./db/conversations.ts";
import * as Layer from "effect/Layer";
import type { QueryDatabaseClient } from "./db/query-database.ts";
import type { ConversationDatabaseSchema } from "./db/schema.ts";
import { ConversationStore } from "./ports/conversation-store.ts";
import type { ConversationStoreShape } from "./ports/conversation-store.ts";
import type { RequestContext } from "./request-context.ts";

export class ConversationStoreLive {
  private constructor() {}

  static shape<TEnvironment>({
    db,
    requestContext,
  }: {
    db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
    requestContext: RequestContext;
  }): ConversationStoreShape<TEnvironment> {
    const userId = requestContext.userId;
    return {
      create: (title) => ConversationDatabase.createConversation(db, userId, title),
      get: (conversationId) => ConversationDatabase.getConversation(db, userId, conversationId),
      list: (search) => ConversationDatabase.getConversations(db, userId, search),
      delete: (conversationId) =>
        ConversationDatabase.deleteConversation(db, userId, conversationId),
      saveMessages: ({ conversationId, parentId, messages }) =>
        ConversationDatabase.saveConversationMessages(db, userId, conversationId, parentId, messages),
      createThread: ({ conversationId, anchorMessageId, title }) =>
        ConversationDatabase.createThread(db, userId, conversationId, anchorMessageId, title),
      addThreadMessage: ({ threadId, messageId }) =>
        ConversationDatabase.addThreadMessage(db, userId, threadId, messageId),
      getThread: (threadId) => ConversationDatabase.getThread(db, userId, threadId),
      getMessages: (conversationId) =>
        ConversationDatabase.getConversationMessages(db, userId, conversationId),
    };
  }

  static layer({
    db,
    requestContext,
  }: {
    db: QueryDatabaseClient<ConversationDatabaseSchema>;
    requestContext: RequestContext;
  }) {
    return Layer.succeed(ConversationStore, this.shape({ db, requestContext }));
  }
}
