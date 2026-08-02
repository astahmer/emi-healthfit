import type { ChatMessage } from "./protocol";

export interface CoreApiClient {
  readonly conversations: {
    list(): Promise<ReadonlyArray<{ readonly id: string; readonly title: string }>>;
  };
  readonly messages: {
    list(input: { readonly conversationId: string }): Promise<ReadonlyArray<ChatMessage>>;
  };
}

export interface CoreApiClientOptions {
  readonly baseUrl: string;
  readonly fetch: typeof globalThis.fetch;
}

export declare const createCoreApiClient: (options: CoreApiClientOptions) => CoreApiClient;
