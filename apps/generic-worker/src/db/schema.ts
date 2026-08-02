export {
  authAccount,
  authSession,
  authUser,
  authVerification,
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
  type AuthDatabaseSchema,
  type ConversationDatabaseSchema,
  type MemoryDatabaseSchema,
} from "@emi/core/server";

import type {
  AuthDatabaseSchema,
  ConversationDatabaseSchema,
  MemoryDatabaseSchema,
} from "@emi/core/server";

export type GenericDatabaseSchema = ConversationDatabaseSchema &
  AuthDatabaseSchema &
  MemoryDatabaseSchema;
