import {
  composeSystemPrompt,
  coreAppDefinition,
  mergeAppDefinitions,
} from "./server/app-definition.ts";
import {
  createAnonymousEmail,
  CurrentUser,
  isAnonymousEmail,
  isAuthorizedAuthEmail,
  isGenericProtectedPath,
  isProtectedPath,
  makeAuthRequestContext,
  parseAllowedEmails,
  withCurrentUser,
} from "./server/auth.export.ts";
import { CurrentRequestContext, makeRequestContext, withRequestContext } from "./server/request-context.ts";
import type { RequestContext } from "./server/request-context.ts";
import { secureStringEqual } from "./server/secure-compare.ts";
import * as AuthSchema from "./server/db/auth-schema.ts";
import * as ConversationDatabase from "./server/db/conversations.ts";
import * as ConversationSchema from "./server/db/schema.ts";
import * as DiscordLinks from "./server/db/discord-links.ts";
import * as DiscordSchema from "./server/db/discord-schema.ts";
import * as GenerationDatabase from "./server/db/generations.ts";
import * as Memories from "./server/db/memories.ts";
import { QueryDatabase } from "./server/db/query-database.ts";
import type { QueryDatabaseClient } from "./server/db/query-database.ts";
import { createGenerationReplayStream } from "./server/generation-replay.ts";
import { makeConversationStore } from "./server/make-conversation-store.ts";
import {
  ConversationStore,
  type AddThreadMessageInput,
  type ConversationStoreShape,
  type CreateThreadInput,
  type SaveMessagesInput,
} from "./server/ports/conversation-store.ts";
import {
  AuthPort,
  ChatModel,
  ChatRepositories,
  ChatServerConfiguration,
} from "./server/ports/chat-server.ts";
import type {
  AuthPortShape,
  ChatModelShape,
  ChatRepositoriesShape,
  ChatServerConfigurationShape,
  ChatServerPrincipal,
  ConversationRepositoryShape,
  GenerationRepositoryShape,
  MemoryRepositoryShape,
  MessageRepositoryShape,
} from "./server/ports/chat-server.ts";
import { ChatServerError } from "./server/use-cases/chat-server.ts";

const {
  addThreadMessage,
  cloneConversation,
  createConversation,
  createThread,
  deleteConversation,
  discardThread,
  getConversation,
  getConversationMessages,
  getConversations,
  getMessage,
  getThread,
  getThreadByAnchor,
  getThreadMessages,
  getThreads,
  getThreadsIncludingDiscarded,
  hashSuggestionsKey,
  pinThread,
  renameConversation,
  renameThread,
  restoreThread,
  reviseConversationMessage,
  saveConversationMessages,
  saveSuggestions,
  summarizeThread,
  updateConversationState,
} = ConversationDatabase;

const {
  appendGenerationChunk,
  appendGenerationChunks,
  cancelRunningGenerations,
  cleanupGenerationHistory,
  createGeneration,
  decodeGenerationChunk,
  expireStaleGenerations,
  finishGeneration,
  getGeneration,
  getGenerationByRequestId,
  getGenerationChunks,
  getResumableGeneration,
  getRunningGeneration,
  isGenerationStale,
  isUniqueConstraintError,
  markGenerationStreaming,
  reconcileFinishedGenerations,
  recordChatEvent,
  updateGenerationMetadata,
} = GenerationDatabase;

const {
  deleteMemoriesByMessage,
  deleteMemory,
  deleteNote,
  getMemories,
  getMemorySummary,
  getNotes,
  insertMemories,
  insertMemory,
  insertNote,
  listMemoryIdsForMessage,
  searchMemories,
  searchNotes,
  updateNote,
  upsertMemorySummary,
} = Memories;

const {
  consumeDiscordLinkCode,
  createDiscordLinkCode,
  getLinkedUserIdForDiscord,
  hashDiscordLinkCode,
  listDiscordAccountLinks,
  listDiscordLinkCodes,
  revokeDiscordLinkCode,
  unlinkDiscordAccount,
  unlinkDiscordAccountByDiscordUserId,
} = DiscordLinks;

const {
  conversations,
  messages,
  threads,
  threadMessages,
  suggestions,
  memories,
  memorySummaries,
  notes,
  chatGenerations,
  chatGenerationChunks,
  chatEvents,
} = ConversationSchema;

const { authUser, authSession, authAccount, authVerification, authSchema } = AuthSchema;
const { discordAccountLinks, discordLinkCodes } = DiscordSchema;
const { GenerationAlreadyActiveError } = GenerationDatabase;

export {
  addThreadMessage,
  appendGenerationChunk,
  appendGenerationChunks,
  AuthPort,
  authAccount,
  authSchema,
  authSession,
  authUser,
  authVerification,
  cancelRunningGenerations,
  ChatModel,
  ChatRepositories,
  ChatServerConfiguration,
  ChatServerError,
  chatEvents,
  chatGenerationChunks,
  chatGenerations,
  cloneConversation,
  cleanupGenerationHistory,
  composeSystemPrompt,
  consumeDiscordLinkCode,
  conversations,
  coreAppDefinition,
  createAnonymousEmail,
  createConversation,
  createDiscordLinkCode,
  createGeneration,
  createGenerationReplayStream,
  createThread,
  CurrentRequestContext,
  CurrentUser,
  deleteConversation,
  deleteMemoriesByMessage,
  deleteMemory,
  deleteNote,
  discordAccountLinks,
  discordLinkCodes,
  discardThread,
  expireStaleGenerations,
  finishGeneration,
  GenerationAlreadyActiveError,
  getConversation,
  getConversationMessages,
  getConversations,
  getGeneration,
  getGenerationByRequestId,
  getGenerationChunks,
  getLinkedUserIdForDiscord,
  getMemories,
  getMemorySummary,
  getMessage,
  getNotes,
  getResumableGeneration,
  getRunningGeneration,
  getThread,
  getThreadByAnchor,
  getThreadMessages,
  getThreads,
  getThreadsIncludingDiscarded,
  hashDiscordLinkCode,
  hashSuggestionsKey,
  insertMemories,
  insertMemory,
  insertNote,
  isAnonymousEmail,
  isAuthorizedAuthEmail,
  isGenerationStale,
  isGenericProtectedPath,
  isProtectedPath,
  isUniqueConstraintError,
  listDiscordAccountLinks,
  listDiscordLinkCodes,
  listMemoryIdsForMessage,
  makeAuthRequestContext,
  makeConversationStore,
  makeRequestContext,
  markGenerationStreaming,
  memories,
  memorySummaries,
  mergeAppDefinitions,
  messages,
  notes,
  parseAllowedEmails,
  pinThread,
  QueryDatabase,
  reconcileFinishedGenerations,
  recordChatEvent,
  renameConversation,
  renameThread,
  restoreThread,
  reviseConversationMessage,
  revokeDiscordLinkCode,
  saveConversationMessages,
  saveSuggestions,
  searchMemories,
  searchNotes,
  secureStringEqual,
  suggestions,
  summarizeThread,
  threadMessages,
  threads,
  unlinkDiscordAccount,
  unlinkDiscordAccountByDiscordUserId,
  updateConversationState,
  updateGenerationMetadata,
  updateNote,
  upsertMemorySummary,
  withCurrentUser,
  withRequestContext,
};

export type {
  AddThreadMessageInput,
  AuthPortShape,
  ChatModelShape,
  ChatRepositoriesShape,
  ChatServerConfigurationShape,
  ChatServerPrincipal,
  ConversationRepositoryShape,
  ConversationStore,
  ConversationStoreShape,
  CreateThreadInput,
  GenerationRepositoryShape,
  MemoryRepositoryShape,
  MessageRepositoryShape,
  QueryDatabaseClient,
  SaveMessagesInput,
  RequestContext,
};

export type ConversationDatabaseSchema = ConversationSchema.ConversationDatabaseSchema;
export type MemoryDatabaseSchema = ConversationSchema.MemoryDatabaseSchema;
export type DiscordDatabaseSchema = DiscordSchema.DiscordDatabaseSchema;
export type AuthDatabaseSchema = AuthSchema.AuthDatabaseSchema;
export type Conversation = ConversationDatabase.Conversation;
export type MessageUsage = ConversationDatabase.MessageUsage;
export type Message = ConversationDatabase.Message;
export type Thread = ConversationDatabase.Thread;
export type ChatGeneration = GenerationDatabase.ChatGeneration;
export type StoredGenerationChunk = GenerationDatabase.StoredGenerationChunk;
export type MemoryInput = Memories.MemoryInput;
export type MemorySearchResult = Memories.MemorySearchResult;
export type MemorySummary = Memories.MemorySummary;
export type DiscordLinkCodeView = DiscordLinks.DiscordLinkCodeView;
export type CreatedDiscordLinkCode = DiscordLinks.CreatedDiscordLinkCode;
export type DiscordAccountLinkView = DiscordLinks.DiscordAccountLinkView;
export type ConsumeDiscordLinkCodeResult = DiscordLinks.ConsumeDiscordLinkCodeResult;
