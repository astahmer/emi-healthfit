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
} from "@emi/core/server/legacy";

import type {
  AuthDatabaseSchema,
  ConversationDatabaseSchema,
  MemoryDatabaseSchema,
} from "@emi/core/server/legacy";

export type GenericDatabaseSchema = ConversationDatabaseSchema &
  AuthDatabaseSchema &
  MemoryDatabaseSchema;
