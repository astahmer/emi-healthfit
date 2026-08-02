import {
  authAccount,
  authSchema,
  authSession,
  authUser,
  authVerification,
} from "./server/db/auth-schema.ts";
import { AppDefinitions } from "./server/app-definition.ts";
import type {
  AppDefinition as AppDefinitionRecord,
  AppIdentity as AppIdentityRecord,
  PromptContributor as PromptContributorRecord,
} from "./server/app-definition.ts";
import { ConversationDatabase } from "./server/db/conversations.ts";
import type {
  Conversation as ConversationRecord,
  Message as MessageRecord,
  MessageUsage as MessageUsageRecord,
  Thread as ThreadRecord,
} from "./server/db/conversations.ts";
import { ConversationRevision } from "./server/db/conversation-revision.ts";
import type {
  AddThreadMessageInput as AddThreadMessageRecord,
  ConversationStoreShape as ConversationStoreRecord,
  CreateThreadInput as CreateThreadRecord,
  SaveMessagesInput as SaveMessagesRecord,
} from "./server/ports/conversation-store.ts";
import { ConversationStore } from "./server/ports/conversation-store.ts";
import { ConversationStoreLive } from "./server/make-conversation-store.ts";
import { DiscordLinkDatabase } from "./server/db/discord-links.ts";
import type {
  ConsumeDiscordLinkCodeResult as ConsumeDiscordLinkCodeRecord,
  CreatedDiscordLinkCode as CreatedDiscordLinkCodeRecord,
  DiscordAccountLinkView as DiscordAccountLinkViewRecord,
  DiscordLinkCodeView as DiscordLinkCodeViewRecord,
} from "./server/db/discord-links.ts";
import { discordAccountLinks, discordLinkCodes } from "./server/db/discord-schema.ts";
import type { DiscordDatabaseSchema as DiscordDatabaseSchemaRecord } from "./server/db/discord-schema.ts";
import { GenerationAlreadyActiveError, GenerationDatabase } from "./server/db/generations.ts";
import type {
  ChatGeneration as ChatGenerationRecord,
  StoredGenerationChunk as StoredGenerationChunkRecord,
} from "./server/db/generations.ts";
import { GenerationReplay } from "./server/generation-replay.ts";
import { MemoryDatabase } from "./server/db/memories.ts";
import type {
  MemoryInput as MemoryInputRecord,
  MemorySearchResult as MemorySearchResultRecord,
  MemorySummary as MemorySummaryRecord,
} from "./server/db/memories.ts";
import { QueryDatabase } from "./server/db/query-database.ts";
import type {
  DatabaseRuntime as DatabaseRuntimeRecord,
  QueryDatabaseClient as QueryDatabaseClientRecord,
} from "./server/db/query-database.ts";
import {
  chatEvents,
  chatGenerationChunks,
  chatGenerations,
  conversations,
  memories,
  memorySummaries,
  messages,
  notes,
  suggestions,
  threadMessages,
  threads,
} from "./server/db/schema.ts";
import type {
  ConversationDatabaseSchema as ConversationDatabaseSchemaRecord,
  ConversationRow as ConversationRowRecord,
  MemoryDatabaseSchema as MemoryDatabaseSchemaRecord,
  MemoryRow as MemoryRowRecord,
  MemorySummaryRow as MemorySummaryRowRecord,
  MessageRow as MessageRowRecord,
  NoteRow as NoteRowRecord,
  SuggestionsRow as SuggestionsRowRecord,
  ThreadMessageRow as ThreadMessageRowRecord,
  ThreadRow as ThreadRowRecord,
} from "./server/db/schema.ts";
import type { AuthDatabaseSchema as AuthDatabaseSchemaRecord } from "./server/db/auth-schema.ts";

export class ServerDatabase {
  static readonly app = AppDefinitions;
  static readonly conversations = ConversationDatabase;
  static readonly conversationRevision = ConversationRevision;
  static readonly discordLinks = DiscordLinkDatabase;
  static readonly generations = GenerationDatabase;
  static readonly memories = MemoryDatabase;
  static readonly query = QueryDatabase;
  static readonly replay = GenerationReplay;
  static readonly store = ConversationStore;
  static readonly storeLive = ConversationStoreLive;
  static readonly errors = {
    generationAlreadyActive: GenerationAlreadyActiveError,
  } as const;
  static readonly tables = {
    auth: {
      account: authAccount,
      schema: authSchema,
      session: authSession,
      user: authUser,
      verification: authVerification,
    },
    chat: {
      conversations,
      events: chatEvents,
      generationChunks: chatGenerationChunks,
      generations: chatGenerations,
      memories,
      memorySummaries,
      messages,
      notes,
      suggestions,
      threadMessages,
      threads,
    },
    discord: {
      accountLinks: discordAccountLinks,
      linkCodes: discordLinkCodes,
    },
  } as const;
}

export namespace ServerDatabase {
  export type AddThreadMessageInput = AddThreadMessageRecord;
  export type AppDefinition = AppDefinitionRecord;
  export type AppIdentity = AppIdentityRecord;
  export type AuthDatabaseSchema = AuthDatabaseSchemaRecord;
  export type ChatGeneration = ChatGenerationRecord;
  export type ConsumeDiscordLinkCodeResult = ConsumeDiscordLinkCodeRecord;
  export type Conversation = ConversationRecord;
  export type ConversationDatabaseSchema = ConversationDatabaseSchemaRecord;
  export type ConversationRow = ConversationRowRecord;
  export type ConversationStoreShape<TEnvironment = never> = ConversationStoreRecord<TEnvironment>;
  export type CreateThreadInput = CreateThreadRecord;
  export type CreatedDiscordLinkCode = CreatedDiscordLinkCodeRecord;
  export type DiscordAccountLinkView = DiscordAccountLinkViewRecord;
  export type DiscordDatabaseSchema = DiscordDatabaseSchemaRecord;
  export type DiscordLinkCodeView = DiscordLinkCodeViewRecord;
  export type MemoryDatabaseSchema = MemoryDatabaseSchemaRecord;
  export type MemoryInput = MemoryInputRecord;
  export type MemoryRow = MemoryRowRecord;
  export type MemorySearchResult = MemorySearchResultRecord;
  export type MemorySummary = MemorySummaryRecord;
  export type MemorySummaryRow = MemorySummaryRowRecord;
  export type Message = MessageRecord;
  export type MessageRow = MessageRowRecord;
  export type MessageUsage = MessageUsageRecord;
  export type NoteRow = NoteRowRecord;
  export type PromptContributor = PromptContributorRecord;
  export type QueryDatabaseClient<TSchema, TEnvironment = never> = QueryDatabaseClientRecord<
    TSchema,
    TEnvironment
  >;
  export type DatabaseRuntime = DatabaseRuntimeRecord;
  export type SaveMessagesInput = SaveMessagesRecord;
  export type StoredGenerationChunk = StoredGenerationChunkRecord;
  export type SuggestionsRow = SuggestionsRowRecord;
  export type Thread = ThreadRecord;
  export type ThreadMessageRow = ThreadMessageRowRecord;
  export type ThreadRow = ThreadRowRecord;
}
