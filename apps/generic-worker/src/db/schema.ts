import { ServerDatabase } from "@emi/core/server/database";

export const authAccount = ServerDatabase.tables.auth.account;
export const authSession = ServerDatabase.tables.auth.session;
export const authUser = ServerDatabase.tables.auth.user;
export const authVerification = ServerDatabase.tables.auth.verification;
export const chatEvents = ServerDatabase.tables.chat.events;
export const chatGenerationChunks = ServerDatabase.tables.chat.generationChunks;
export const chatGenerations = ServerDatabase.tables.chat.generations;
export const conversations = ServerDatabase.tables.chat.conversations;
export const memories = ServerDatabase.tables.chat.memories;
export const memorySummaries = ServerDatabase.tables.chat.memorySummaries;
export const messages = ServerDatabase.tables.chat.messages;
export const notes = ServerDatabase.tables.chat.notes;
export const suggestions = ServerDatabase.tables.chat.suggestions;
export const threadMessages = ServerDatabase.tables.chat.threadMessages;
export const threads = ServerDatabase.tables.chat.threads;

export type AuthDatabaseSchema = ServerDatabase.AuthDatabaseSchema;
export type ConversationDatabaseSchema = ServerDatabase.ConversationDatabaseSchema;
export type MemoryDatabaseSchema = ServerDatabase.MemoryDatabaseSchema;
export type GenericDatabaseSchema = ConversationDatabaseSchema &
  AuthDatabaseSchema &
  MemoryDatabaseSchema;
