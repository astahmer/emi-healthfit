import {
  BadRequest,
  BadRequestSchema,
  Content,
  Created,
  Deleted,
  Identifier,
  InternalServerError,
  InternalServerErrorSchema,
  Limit,
  NotFound,
  NotFoundSchema,
  StandardErrors,
} from "./contract/common.ts";
import {
  Conversation as ConversationSchema,
  ConversationsApi,
  Message as MessageSchema,
  MessagesApi,
  MessageUsage as MessageUsageSchema,
  Thread as ThreadSchema,
  ThreadWithMessages as ThreadWithMessagesSchema,
  ThreadsApi,
} from "./contract/conversations.ts";
import { MemoriesExtraApi, ModelClientConfiguration, SuggestionsApi } from "./contract/data.ts";
import {
  CreatedDiscordLinkCode as CreatedDiscordLinkCodeSchema,
  DiscordAccountLink as DiscordAccountLinkSchema,
  DiscordApi,
  DiscordLinkCode as DiscordLinkCodeSchema,
} from "./contract/discord.ts";
import {
  MemoriesApi,
  Memory as MemorySchema,
  MemorySummary as MemorySummarySchema,
  Note as NoteSchema,
  NotesApi,
} from "./contract/notes-and-memories.ts";
import type {
  Conversation as ConversationType,
  Message as MessageType,
  MessageUsage as MessageUsageType,
  Thread as ThreadType,
  ThreadWithMessages as ThreadWithMessagesType,
} from "./contract/conversations.ts";
import type {
  CreatedDiscordLinkCode as CreatedDiscordLinkCodeType,
  DiscordAccountLink as DiscordAccountLinkType,
  DiscordLinkCode as DiscordLinkCodeType,
} from "./contract/discord.ts";
import type {
  Memory as MemoryType,
  MemorySummary as MemorySummaryType,
  Note as NoteType,
} from "./contract/notes-and-memories.ts";
import { HttpApi } from "effect/unstable/httpapi";

const Conversation = ConversationSchema;
const CreatedDiscordLinkCode = CreatedDiscordLinkCodeSchema;
const DiscordAccountLink = DiscordAccountLinkSchema;
const DiscordLinkCode = DiscordLinkCodeSchema;
const Memory = MemorySchema;
const MemorySummary = MemorySummarySchema;
const Message = MessageSchema;
const MessageUsage = MessageUsageSchema;
const Note = NoteSchema;
const Thread = ThreadSchema;
const ThreadWithMessages = ThreadWithMessagesSchema;

export {
  BadRequest,
  BadRequestSchema,
  Content,
  Conversation,
  ConversationsApi,
  Created,
  CreatedDiscordLinkCode,
  Deleted,
  DiscordAccountLink,
  DiscordApi,
  DiscordLinkCode,
  Identifier,
  InternalServerError,
  InternalServerErrorSchema,
  Limit,
  MemoriesApi,
  MemoriesExtraApi,
  Memory,
  MemorySummary,
  Message,
  MessagesApi,
  MessageUsage,
  NotFound,
  NotFoundSchema,
  Note,
  NotesApi,
  ModelClientConfiguration,
  StandardErrors,
  SuggestionsApi,
  Thread,
  ThreadWithMessages,
  ThreadsApi,
};

export type Conversation = ConversationType;
export type CreatedDiscordLinkCode = CreatedDiscordLinkCodeType;
export type DiscordAccountLink = DiscordAccountLinkType;
export type DiscordLinkCode = DiscordLinkCodeType;
export type Memory = MemoryType;
export type MemorySummary = MemorySummaryType;
export type Message = MessageType;
export type MessageUsage = MessageUsageType;
export type Note = NoteType;
export type Thread = ThreadType;
export type ThreadWithMessages = ThreadWithMessagesType;

export const CoreApi = HttpApi.make("emi-core-api")
  .add(NotesApi)
  .add(MemoriesApi)
  .add(ConversationsApi)
  .add(ThreadsApi)
  .add(MessagesApi)
  .add(SuggestionsApi)
  .add(MemoriesExtraApi)
  .add(DiscordApi);
