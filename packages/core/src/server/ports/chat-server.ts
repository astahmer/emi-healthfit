import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import type {
  ChatMessage,
  Conversation,
  GenerationEvent,
  ModelConfiguration,
} from "../../protocol/index.ts";
import type { ChatExtension } from "../../extensions/index.ts";
import type { ChatServerError } from "../use-cases/chat-server.ts";

export interface ChatServerPrincipal {
  readonly subject: string;
}

export interface AuthPort {
  readonly authenticate: (request: Request) => Effect.Effect<ChatServerPrincipal, ChatServerError>;
}

export interface ConversationRepository {
  readonly list: (input: {
    readonly subject: string;
  }) => Effect.Effect<ReadonlyArray<Conversation>, ChatServerError>;
}

export interface MessageRepository {
  readonly append: (input: {
    readonly subject: string;
    readonly conversationId: string;
    readonly message: ChatMessage;
  }) => Effect.Effect<void, ChatServerError>;
}

export interface GenerationRepository {
  readonly admit: (input: {
    readonly subject: string;
    readonly requestId: string;
    readonly conversationId: string;
    readonly model?: string;
  }) => Effect.Effect<void, ChatServerError>;
  readonly append: (input: {
    readonly subject: string;
    readonly requestId: string;
    readonly event: GenerationEvent;
  }) => Effect.Effect<void, ChatServerError>;
}

export interface MemoryRepository {
  readonly list: (input: {
    readonly subject: string;
  }) => Effect.Effect<ReadonlyArray<{ readonly id: string }>, ChatServerError>;
}

export interface ChatModel {
  readonly generate: (input: {
    readonly subject: string;
    readonly messages: ReadonlyArray<ChatMessage>;
    readonly configuration: ModelConfiguration;
    readonly signal?: AbortSignal;
  }) => Stream.Stream<GenerationEvent, ChatServerError>;
}

export interface ChatRepositories {
  readonly conversations: ConversationRepository;
  readonly messages: MessageRepository;
  readonly generations: GenerationRepository;
  readonly memories: MemoryRepository;
}

export interface ChatServerOptions {
  readonly auth: AuthPort;
  readonly repositories: ChatRepositories;
  readonly model: ChatModel;
  readonly configuration: ModelConfiguration;
  readonly extensions?: ReadonlyArray<ChatExtension>;
}
