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
  ConversationDatabaseShape as ConversationDatabaseShapeRecord,
  ConversationMessageSearchResult as ConversationMessageSearchResultRecord,
  Message as MessageRecord,
  MessageUsage as MessageUsageRecord,
  Thread as ThreadRecord,
} from "./server/db/conversations.ts";
import { ConversationRevision } from "./server/db/conversation-revision.ts";
import type {
  AddThreadMessageInput as AddThreadMessageRecord,
  ConversationReaderShape as ConversationReaderRecord,
  ConversationWriterShape as ConversationWriterRecord,
  CreateThreadInput as CreateThreadRecord,
  MessageStoreShape as MessageStoreRecord,
  SaveMessagesInput as SaveMessagesRecord,
  ThreadStoreShape as ThreadStoreRecord,
} from "./server/ports/conversation-store.ts";
import {
  ConversationReader,
  ConversationWriter,
  MessageStore,
  ThreadStore,
} from "./server/ports/conversation-store.ts";
import { ConversationStoreLive } from "./server/make-conversation-store.ts";
import { DiscordLinkDatabase } from "./server/db/discord-links.ts";
import type {
  ConsumeDiscordLinkCodeResult as ConsumeDiscordLinkCodeRecord,
  CreatedDiscordLinkCode as CreatedDiscordLinkCodeRecord,
  DiscordAccountLinkView as DiscordAccountLinkViewRecord,
  DiscordLinkDatabaseShape as DiscordLinkDatabaseShapeRecord,
  DiscordLinkCodeView as DiscordLinkCodeViewRecord,
} from "./server/db/discord-links.ts";
import { discordAccountLinks, discordLinkCodes } from "./server/db/discord-schema.ts";
import type { DiscordDatabaseSchema as DiscordDatabaseSchemaRecord } from "./server/db/discord-schema.ts";
import { GenerationAlreadyActiveError, GenerationDatabase } from "./server/db/generations.ts";
import type {
  ChatGeneration as ChatGenerationRecord,
  GenerationDatabaseShape as GenerationDatabaseShapeRecord,
  StoredGenerationChunk as StoredGenerationChunkRecord,
} from "./server/db/generations.ts";
import { GenerationReplay } from "./server/generation-replay.ts";
import { GenerationStoreLive } from "./server/make-generation-store.ts";
import {
  GenerationChunkReader,
  GenerationChunkWriter,
  GenerationConflictError,
  GenerationReader,
  GenerationWriter,
} from "./server/ports/generation-store.ts";
import type {
  CreateGenerationInput as CreateGenerationRecord,
  FinishGenerationInput as FinishGenerationRecord,
  GenerationChunkReaderShape as GenerationChunkReaderRecord,
  GenerationChunkRecord as GenerationChunkRecordType,
  GenerationChunkWriterShape as GenerationChunkWriterRecord,
  GenerationError as GenerationErrorRecord,
  GenerationReaderShape as GenerationReaderRecord,
  GenerationRecord as GenerationRecordType,
  GenerationStatus as GenerationStatusRecord,
  GenerationStoreError as GenerationStoreErrorRecord,
  GenerationWriterShape as GenerationWriterRecord,
} from "./server/ports/generation-store.ts";
import { MemoryDatabase } from "./server/db/memories.ts";
import type {
  MemoryInput as MemoryInputRecord,
  MemoryDatabaseShape as MemoryDatabaseShapeRecord,
  MemorySearchResult as MemorySearchResultRecord,
  MemorySummary as MemorySummaryRecord,
} from "./server/db/memories.ts";
import { MemoryStoreLive } from "./server/make-memory-store.ts";
import { MemoryContext } from "./server/memory-context.ts";
import { MemoryReader, MemorySummaryStore, MemoryWriter } from "./server/ports/memory-store.ts";
import type {
  MemoryReaderShape as MemoryReaderRecord,
  MemorySummaryStoreShape as MemorySummaryStoreRecord,
  MemoryWriterShape as MemoryWriterRecord,
} from "./server/ports/memory-store.ts";
import { DatabaseQueryError, QueryDatabase } from "./server/db/query-database.ts";
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
  static readonly generationReader = GenerationReader;
  static readonly generationWriter = GenerationWriter;
  static readonly generationChunkReader = GenerationChunkReader;
  static readonly generationChunkWriter = GenerationChunkWriter;
  static readonly generationStoreLive = GenerationStoreLive;
  static readonly conversationReader = ConversationReader;
  static readonly conversationWriter = ConversationWriter;
  static readonly messageStore = MessageStore;
  static readonly threadStore = ThreadStore;
  static readonly storeLive = ConversationStoreLive;
  static readonly memoryReader = MemoryReader;
  static readonly memoryWriter = MemoryWriter;
  static readonly memorySummaryStore = MemorySummaryStore;
  static readonly memoryStoreLive = MemoryStoreLive;
  static readonly memoryContext = MemoryContext;
  static readonly errors = {
    databaseQuery: DatabaseQueryError,
    generationAlreadyActive: GenerationAlreadyActiveError,
    generationConflict: GenerationConflictError,
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
  export type CreateGenerationInput = CreateGenerationRecord;
  export type ConsumeDiscordLinkCodeResult = ConsumeDiscordLinkCodeRecord;
  export type Conversation = ConversationRecord;
  export type ConversationDatabaseShape = ConversationDatabaseShapeRecord;
  export type ConversationMessageSearchResult = ConversationMessageSearchResultRecord;
  export type ConversationDatabaseSchema = ConversationDatabaseSchemaRecord;
  export type ConversationRow = ConversationRowRecord;
  export type ConversationReaderShape<TEnvironment = never> =
    ConversationReaderRecord<TEnvironment>;
  export type ConversationWriterShape<TEnvironment = never> =
    ConversationWriterRecord<TEnvironment>;
  export type CreateThreadInput = CreateThreadRecord;
  export type CreatedDiscordLinkCode = CreatedDiscordLinkCodeRecord;
  export type DiscordAccountLinkView = DiscordAccountLinkViewRecord;
  export type DiscordDatabaseSchema = DiscordDatabaseSchemaRecord;
  export type DiscordLinkDatabaseShape = DiscordLinkDatabaseShapeRecord;
  export type DiscordLinkCodeView = DiscordLinkCodeViewRecord;
  export type MemoryDatabaseSchema = MemoryDatabaseSchemaRecord;
  export type MemoryInput = MemoryInputRecord;
  export type MemoryDatabaseShape = MemoryDatabaseShapeRecord;
  export type MemoryReaderShape<TEnvironment = never> = MemoryReaderRecord<TEnvironment>;
  export type MemoryRow = MemoryRowRecord;
  export type MemorySearchResult = MemorySearchResultRecord;
  export type MemorySummary = MemorySummaryRecord;
  export type MemorySummaryStoreShape<TEnvironment = never> =
    MemorySummaryStoreRecord<TEnvironment>;
  export type MemorySummaryRow = MemorySummaryRowRecord;
  export type MemoryWriterShape<TEnvironment = never> = MemoryWriterRecord<TEnvironment>;
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
  export type MessageStoreShape<TEnvironment = never> = MessageStoreRecord<TEnvironment>;
  export type StoredGenerationChunk = StoredGenerationChunkRecord;
  export type FinishGenerationInput = FinishGenerationRecord;
  export type GenerationChunkReaderShape<TEnvironment = never> =
    GenerationChunkReaderRecord<TEnvironment>;
  export type GenerationChunkRecord = GenerationChunkRecordType;
  export type GenerationChunkWriterShape<TEnvironment = never> =
    GenerationChunkWriterRecord<TEnvironment>;
  export type GenerationError = GenerationErrorRecord;
  export type GenerationDatabaseShape = GenerationDatabaseShapeRecord;
  export type GenerationReaderShape<TEnvironment = never> = GenerationReaderRecord<TEnvironment>;
  export type GenerationRecord = GenerationRecordType;
  export type GenerationStatus = GenerationStatusRecord;
  export type GenerationStoreError = GenerationStoreErrorRecord;
  export type GenerationWriterShape<TEnvironment = never> = GenerationWriterRecord<TEnvironment>;
  export type SuggestionsRow = SuggestionsRowRecord;
  export type Thread = ThreadRecord;
  export type ThreadStoreShape<TEnvironment = never> = ThreadStoreRecord<TEnvironment>;
  export type ThreadMessageRow = ThreadMessageRowRecord;
  export type ThreadRow = ThreadRowRecord;
}
