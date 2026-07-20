import {
  addThreadMessage,
  createConversation,
  createThread,
  deleteConversation,
  getConversation,
  getConversationMessages,
  getConversations,
  getThread,
  saveConversationMessages,
} from "./db/conversations.ts";
import type { QueryDatabaseClient } from "./db/query-database.ts";
import type { ConversationDatabaseSchema } from "./db/schema.ts";
import type { ConversationStoreShape } from "./ports/conversation-store.ts";
import type { RequestContext } from "./request-context.ts";

export const makeConversationStore = <TEnvironment>({
  db,
  requestContext,
}: {
  db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
  requestContext: RequestContext;
}): ConversationStoreShape<TEnvironment> => {
  const userId = requestContext.userId;
  return {
    create: (title) => createConversation(db, userId, title),
    get: (conversationId) => getConversation(db, userId, conversationId),
    list: (search) => getConversations(db, userId, search),
    delete: (conversationId) => deleteConversation(db, userId, conversationId),
    saveMessages: ({ conversationId, parentId, messages }) =>
      saveConversationMessages(db, userId, conversationId, parentId, messages),
    createThread: ({ conversationId, anchorMessageId, title }) =>
      createThread(db, userId, conversationId, anchorMessageId, title),
    addThreadMessage: ({ threadId, messageId }) =>
      addThreadMessage(db, userId, threadId, messageId),
    getThread: (threadId) => getThread(db, userId, threadId),
    getMessages: (conversationId) => getConversationMessages(db, userId, conversationId),
  };
};
