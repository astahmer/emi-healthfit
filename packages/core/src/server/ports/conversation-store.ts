import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Conversation, Message, MessageUsage, Thread } from "../db/conversations.ts";

export interface SaveMessagesInput {
  conversationId: string;
  parentId: string | null;
  messages: Array<{
    id?: string;
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

export interface UpdateConversationInput {
  conversationId: string;
  status?: "regular" | "archived";
  pinned?: boolean;
}

export interface RenameThreadInput {
  threadId: string;
  title: string;
}

export interface SetThreadPinnedInput {
  threadId: string;
  pinned: boolean;
}

export interface ConversationReaderShape<TEnvironment = never> {
  readonly get: (conversationId: string) => Effect.Effect<Conversation | null, never, TEnvironment>;
  readonly list: (search?: string) => Effect.Effect<Conversation[], never, TEnvironment>;
}

export interface ConversationWriterShape<TEnvironment = never> {
  readonly create: (title?: string) => Effect.Effect<string, never, TEnvironment>;
  readonly delete: (conversationId: string) => Effect.Effect<void, never, TEnvironment>;
  readonly rename: (input: {
    readonly conversationId: string;
    readonly title: string;
  }) => Effect.Effect<void, never, TEnvironment>;
  readonly updateState: (
    input: UpdateConversationInput,
  ) => Effect.Effect<void, never, TEnvironment>;
  readonly clone: (
    conversationId: string,
  ) => Effect.Effect<Conversation | null, never, TEnvironment>;
}

export interface MessageStoreShape<TEnvironment = never> {
  readonly saveMessages: (input: SaveMessagesInput) => Effect.Effect<string[], never, TEnvironment>;
  readonly getMessages: (conversationId: string) => Effect.Effect<Message[], never, TEnvironment>;
}

export interface ThreadStoreShape<TEnvironment = never> {
  readonly createThread: (
    input: CreateThreadInput,
  ) => Effect.Effect<string | null, never, TEnvironment>;
  readonly addThreadMessage: (
    input: AddThreadMessageInput,
  ) => Effect.Effect<boolean, never, TEnvironment>;
  readonly list: (conversationId: string) => Effect.Effect<Thread[], never, TEnvironment>;
  readonly getThread: (threadId: string) => Effect.Effect<Thread | null, never, TEnvironment>;
  readonly getMessages: (threadId: string) => Effect.Effect<Message[], never, TEnvironment>;
  readonly rename: (input: RenameThreadInput) => Effect.Effect<void, never, TEnvironment>;
  readonly setPinned: (input: SetThreadPinnedInput) => Effect.Effect<void, never, TEnvironment>;
  readonly discard: (threadId: string) => Effect.Effect<void, never, TEnvironment>;
  readonly restore: (threadId: string) => Effect.Effect<void, never, TEnvironment>;
}

export class ConversationReader extends Context.Service<
  ConversationReader,
  ConversationReaderShape
>()("@emi/core/server/ConversationReader") {}

export class ConversationWriter extends Context.Service<
  ConversationWriter,
  ConversationWriterShape
>()("@emi/core/server/ConversationWriter") {}

export class MessageStore extends Context.Service<MessageStore, MessageStoreShape>()(
  "@emi/core/server/MessageStore",
) {}

export class ThreadStore extends Context.Service<ThreadStore, ThreadStoreShape>()(
  "@emi/core/server/ThreadStore",
) {}
