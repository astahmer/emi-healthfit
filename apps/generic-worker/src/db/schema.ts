export {
  authAccount,
  authSession,
  authUser,
  authVerification,
  conversations,
  messages,
  suggestions,
  threadMessages,
  threads,
  type AuthDatabaseSchema,
  type ConversationDatabaseSchema,
} from "@emi/core/server";

import type { AuthDatabaseSchema, ConversationDatabaseSchema } from "@emi/core/server";

export type GenericDatabaseSchema = ConversationDatabaseSchema & AuthDatabaseSchema;
