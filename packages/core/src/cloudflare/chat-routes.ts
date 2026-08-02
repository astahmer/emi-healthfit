import { ChatRouteConversation } from "./chat-route-conversation.ts";
import { ChatRouteMemory } from "./chat-route-memory.ts";
import { ChatRouteStream } from "./chat-route-stream.ts";
import type { CloudflareQueryDatabaseClient } from "./db/client.ts";
import type { ConversationDatabaseSchema, MemoryDatabaseSchema } from "../server/db/schema.ts";

type PersistedChatDatabase = ConversationDatabaseSchema & MemoryDatabaseSchema;

export const makeGenericChatRoutes = <Database extends PersistedChatDatabase>({
  db,
}: {
  readonly db: CloudflareQueryDatabaseClient<Database>;
}) => {
  const conversationDb = db as unknown as CloudflareQueryDatabaseClient<ConversationDatabaseSchema>;
  const memoryDb = db as unknown as CloudflareQueryDatabaseClient<MemoryDatabaseSchema>;
  return {
    ...ChatRouteConversation.make({ db: conversationDb }),
    ...ChatRouteMemory.make({ db: memoryDb }),
    ...ChatRouteStream.make({ conversationDb, memoryDb }),
  };
};
