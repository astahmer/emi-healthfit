import { ChatRouteApp } from "./chat-route-app.ts";
import { ChatRouteConversation } from "./chat-route-conversation.ts";
import { ChatRouteMemory } from "./chat-route-memory.ts";
import { ChatRouteStream } from "./chat-route-stream.ts";
import type { CloudflareQueryDatabaseClient } from "./db/client.ts";
import type { ConversationDatabaseSchema, MemoryDatabaseSchema } from "../server/db/schema.ts";
import type { ChatAppConfig } from "../chat/app-config.ts";
import type { ReadWriteBucketClient } from "./chat-attachment-storage.ts";

type PersistedChatDatabase = ConversationDatabaseSchema & MemoryDatabaseSchema;

export const makeGenericChatRoutes = <Database extends PersistedChatDatabase>({
  db,
  appConfig,
  attachmentsBucket,
}: {
  readonly db: CloudflareQueryDatabaseClient<Database>;
  readonly appConfig?: ChatAppConfig;
  readonly attachmentsBucket?: ReadWriteBucketClient;
}) => {
  const conversationDb = db as unknown as CloudflareQueryDatabaseClient<ConversationDatabaseSchema>;
  const memoryDb = db as unknown as CloudflareQueryDatabaseClient<MemoryDatabaseSchema>;
  return {
    ...ChatRouteApp.make({ appConfig }),
    ...ChatRouteConversation.make({ db: conversationDb, memoryDb, attachmentsBucket }),
    ...ChatRouteMemory.make({ db: memoryDb }),
    ...ChatRouteStream.make({ conversationDb, memoryDb, attachmentsBucket }),
  };
};
