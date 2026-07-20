import type { RuntimeContext } from "alchemy";
import type * as Effect from "effect/Effect";
import type { JSONSchema7 } from "json-schema";
import type { QueryDatabaseClient } from "../../platform/db/client.ts";

export type ChatToolDefinition = {
  name: string;
  description: string;
  parameters: JSONSchema7;
};

export type ChatToolExecutor = (args: {
  db: QueryDatabaseClient;
  userId: string;
  name: string;
  args: Record<string, unknown>;
  conversationId?: string;
  summarize?: (messages: Array<{ role: string; text: string }>) => Effect.Effect<string, Error>;
}) => Effect.Effect<unknown, unknown, RuntimeContext>;

export type ChatLifecycleHooks = {
  beforeChat?: (args: {
    db: QueryDatabaseClient;
    userId: string;
    environment: Record<string, unknown>;
  }) => Effect.Effect<void, unknown, unknown>;
  coachSystemPrompt?: string;
  tools?: ReadonlyArray<ChatToolDefinition>;
  executeTool?: ChatToolExecutor;
};
