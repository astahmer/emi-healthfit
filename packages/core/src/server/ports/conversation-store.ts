import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Conversation, Message, MessageUsage, Thread } from "../db/conversations.ts";

export interface SaveMessagesInput {
  conversationId: string;
  parentId: string | null;
  messages: Array<{
    role: Message["role"];
    parts: unknown[];
    usage?: MessageUsage;
    model?: string;
  }>;
}

export interface CreateThreadInput {
  conversationId: string;
  anchorMessageId: string;
  title?: string;
}

export interface AddThreadMessageInput {
  threadId: string;
  messageId: string;
}

export interface ConversationStoreShape<TEnvironment = never> {
  readonly create: (title?: string) => Effect.Effect<string, never, TEnvironment>;
  readonly get: (conversationId: string) => Effect.Effect<Conversation | null, never, TEnvironment>;
  readonly list: (search?: string) => Effect.Effect<Conversation[], never, TEnvironment>;
  readonly delete: (conversationId: string) => Effect.Effect<void, never, TEnvironment>;
  readonly saveMessages: (input: SaveMessagesInput) => Effect.Effect<string[], never, TEnvironment>;
  readonly createThread: (
    input: CreateThreadInput,
  ) => Effect.Effect<string | null, never, TEnvironment>;
  readonly addThreadMessage: (
    input: AddThreadMessageInput,
  ) => Effect.Effect<boolean, never, TEnvironment>;
  readonly getThread: (threadId: string) => Effect.Effect<Thread | null, never, TEnvironment>;
  readonly getMessages: (conversationId: string) => Effect.Effect<Message[], never, TEnvironment>;
}

export class ConversationStore extends Context.Service<ConversationStore, ConversationStoreShape>()(
  "@emi/core/server/ConversationStore",
) {}
