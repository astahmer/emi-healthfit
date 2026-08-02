import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import type {
  ChatMessage,
  Conversation,
  GenerationEvent,
  ModelConfiguration,
} from "../../protocol.export.ts";
import type { ChatExtension } from "../../extensions.export.ts";
import type { ChatServerError } from "../use-cases/chat-server.ts";

export interface ChatServerPrincipal {
  readonly subject: string;
}

export interface AuthPortShape {
  readonly authenticate: (
    request: Request,
  ) => Effect.Effect<ChatServerPrincipal, ChatServerError>;
}

export class AuthPort extends Context.Service<AuthPort, AuthPortShape>()(
  "@emi/core/server/AuthPort",
) {}

export interface ConversationRepositoryShape {
  readonly list: (input: {
    readonly subject: string;
  }) => Effect.Effect<ReadonlyArray<Conversation>, ChatServerError>;
}

export interface MessageRepositoryShape {
  readonly append: (input: {
    readonly subject: string;
    readonly conversationId: string;
    readonly message: ChatMessage;
  }) => Effect.Effect<void, ChatServerError>;
}

export interface GenerationRepositoryShape {
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

export interface MemoryRepositoryShape {
  readonly list: (input: {
    readonly subject: string;
  }) => Effect.Effect<ReadonlyArray<{ readonly id: string }>, ChatServerError>;
}

export interface ChatRepositoriesShape {
  readonly conversations: ConversationRepositoryShape;
  readonly messages: MessageRepositoryShape;
  readonly generations: GenerationRepositoryShape;
  readonly memories: MemoryRepositoryShape;
}

export class ChatRepositories extends Context.Service<
  ChatRepositories,
  ChatRepositoriesShape
>()("@emi/core/server/ChatRepositories") {}

export interface ChatModelShape {
  readonly generate: (input: {
    readonly subject: string;
    readonly messages: ReadonlyArray<ChatMessage>;
    readonly configuration: ModelConfiguration;
    readonly signal?: AbortSignal;
  }) => Stream.Stream<GenerationEvent, ChatServerError>;
}

export class ChatModel extends Context.Service<ChatModel, ChatModelShape>()(
  "@emi/core/server/ChatModel",
) {}

export interface ChatServerConfigurationShape {
  readonly model: ModelConfiguration;
  readonly extensions: ReadonlyArray<ChatExtension>;
}

export class ChatServerConfiguration extends Context.Service<
  ChatServerConfiguration,
  ChatServerConfigurationShape
>()("@emi/core/server/ChatServerConfiguration") {}
