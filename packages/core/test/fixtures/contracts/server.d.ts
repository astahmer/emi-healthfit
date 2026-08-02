import type { ChatMessage, GenerationEvent, ModelConfiguration, TransportError } from "./protocol";

export interface ConversationRepository {
  list(): Promise<ReadonlyArray<{ readonly id: string; readonly title: string }>>;
  save(input: { readonly id: string; readonly title: string }): Promise<void>;
}

export interface MessageRepository {
  list(input: { readonly conversationId: string }): Promise<ReadonlyArray<ChatMessage>>;
  append(input: { readonly conversationId: string; readonly message: ChatMessage }): Promise<void>;
}

export interface GenerationRepository {
  admit(input: { readonly requestId: string }): Promise<void>;
  append(input: { readonly requestId: string; readonly event: GenerationEvent }): Promise<void>;
}

export interface MemoryRepository {
  list(): Promise<ReadonlyArray<{ readonly id: string; readonly content: string }>>;
}

export interface ModelProvider {
  generate(input: {
    readonly messages: ReadonlyArray<ChatMessage>;
    readonly configuration: ModelConfiguration;
    readonly signal?: AbortSignal;
  }): AsyncIterable<GenerationEvent>;
}

export interface ChatRepositories {
  readonly conversations: ConversationRepository;
  readonly messages: MessageRepository;
  readonly generations: GenerationRepository;
  readonly memories: MemoryRepository;
}

export interface ChatServerOptions {
  readonly auth: (request: Request) => Promise<{ readonly subject: string }>;
  readonly repositories: ChatRepositories;
  readonly model: ModelProvider;
  readonly extensions?: ReadonlyArray<unknown>;
}

export interface ChatServerError extends TransportError {
  readonly kind: "unauthorized" | "conflict" | "invalid-input" | "internal";
}

export interface ChatServer {
  readonly options: ChatServerOptions;
}

export declare const createChatServer: (options: ChatServerOptions) => ChatServer;
