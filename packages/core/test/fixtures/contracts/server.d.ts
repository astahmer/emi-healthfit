import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import type { ChatMessage, Conversation, GenerationEvent, ModelConfiguration } from "./protocol";

export interface AuthPrincipal {
  readonly subject: string;
}

export interface AuthPort {
  authenticate(request: Request): Effect.Effect<AuthPrincipal, ChatServerError>;
}

export interface ConversationRepository {
  list(input: { readonly subject: string }): Effect.Effect<ReadonlyArray<Conversation>, ChatServerError>;
}

export interface MessageRepository {
  append(input: {
    readonly subject: string;
    readonly conversationId: string;
    readonly message: ChatMessage;
  }): Effect.Effect<void, ChatServerError>;
}

export interface GenerationRepository {
  admit(input: {
    readonly subject: string;
    readonly requestId: string;
    readonly conversationId: string;
  }): Effect.Effect<void, ChatServerError>;
  append(input: {
    readonly subject: string;
    readonly requestId: string;
    readonly event: GenerationEvent;
  }): Effect.Effect<void, ChatServerError>;
}

export interface MemoryRepository {
  list(input: { readonly subject: string }): Effect.Effect<ReadonlyArray<{ readonly id: string }>, ChatServerError>;
}

export interface ChatModel {
  generate(input: {
    readonly subject: string;
    readonly messages: ReadonlyArray<ChatMessage>;
    readonly configuration: ModelConfiguration;
    readonly signal?: AbortSignal;
  }): Stream.Stream<GenerationEvent, ChatServerError>;
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
  readonly extensions?: ReadonlyArray<unknown>;
}

export declare class ChatServerError extends Error {
  readonly kind: "unauthorized" | "conflict" | "invalid-input" | "internal";
}

export declare class ChatServer {
  constructor(options: ChatServerOptions);
  listConversations(request: Request): Effect.Effect<ReadonlyArray<Conversation>, ChatServerError>;
  generate(
    request: Request,
    input: {
      readonly requestId: string;
      readonly conversationId: string;
      readonly message: ChatMessage;
    },
  ): Stream.Stream<GenerationEvent, ChatServerError>;
  handle(request: Request): Effect.Effect<Response, ChatServerError>;
}
