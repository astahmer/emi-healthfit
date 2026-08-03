import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type {
  Conversation,
  ConversationCloneError,
  ConversationMessageSearchResult,
  Message,
  MessageUsage,
  Thread,
} from "../db/conversations.ts";
import type { DatabaseQueryError } from "../db/query-database.ts";

type DatabaseEffect<Value, Error = never, Environment = never> = Effect.Effect<
  Value,
  Error | DatabaseQueryError,
  Environment
>;

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
  readonly get: (
    conversationId: string,
  ) => DatabaseEffect<Conversation | null, never, TEnvironment>;
  readonly list: (search?: string) => DatabaseEffect<Conversation[], never, TEnvironment>;
  readonly searchMessages: (input: {
    readonly query: string;
    readonly excludeConversationId?: string;
    readonly limit?: number;
  }) => DatabaseEffect<ReadonlyArray<ConversationMessageSearchResult>, never, TEnvironment>;
}

export interface ConversationWriterShape<TEnvironment = never> {
  readonly create: (title?: string) => DatabaseEffect<string, never, TEnvironment>;
  readonly delete: (conversationId: string) => DatabaseEffect<void, never, TEnvironment>;
  readonly rename: (input: {
    readonly conversationId: string;
    readonly title: string;
  }) => DatabaseEffect<void, never, TEnvironment>;
  readonly updateState: (
    input: UpdateConversationInput,
  ) => DatabaseEffect<void, never, TEnvironment>;
  readonly clone: (
    conversationId: string,
  ) => DatabaseEffect<Conversation | null, ConversationCloneError, TEnvironment>;
}

export interface MessageStoreShape<TEnvironment = never> {
  readonly saveMessages: (
    input: SaveMessagesInput,
  ) => DatabaseEffect<string[], never, TEnvironment>;
  readonly getMessages: (conversationId: string) => DatabaseEffect<Message[], never, TEnvironment>;
}

export interface ThreadStoreShape<TEnvironment = never> {
  readonly createThread: (
    input: CreateThreadInput,
  ) => DatabaseEffect<string | null, never, TEnvironment>;
  readonly addThreadMessage: (
    input: AddThreadMessageInput,
  ) => DatabaseEffect<boolean, never, TEnvironment>;
  readonly list: (conversationId: string) => DatabaseEffect<Thread[], never, TEnvironment>;
  readonly getThread: (threadId: string) => DatabaseEffect<Thread | null, never, TEnvironment>;
  readonly getMessages: (threadId: string) => DatabaseEffect<Message[], never, TEnvironment>;
  readonly rename: (input: RenameThreadInput) => DatabaseEffect<void, never, TEnvironment>;
  readonly setPinned: (input: SetThreadPinnedInput) => DatabaseEffect<void, never, TEnvironment>;
  readonly discard: (threadId: string) => DatabaseEffect<void, never, TEnvironment>;
  readonly restore: (threadId: string) => DatabaseEffect<void, never, TEnvironment>;
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
