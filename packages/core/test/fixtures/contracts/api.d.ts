import type * as Effect from "effect/Effect";
import type { ChatMessage, Conversation } from "./protocol";

export declare class CoreApiClientError extends Error {
  readonly _tag: "CoreApiClientError";
  readonly kind: "network" | "http" | "decode";
  readonly message: string;
}

export interface CoreApiClientOptions {
  readonly baseUrl: string;
  readonly fetch: typeof globalThis.fetch;
}

export declare class CoreApiClient {
  readonly conversations: {
    list(): Effect.Effect<ReadonlyArray<Conversation>, CoreApiClientError>;
  };
  readonly messages: {
    list(input: {
      readonly conversationId: string;
    }): Effect.Effect<ReadonlyArray<ChatMessage>, CoreApiClientError>;
  };
  static create(options: CoreApiClientOptions): CoreApiClient;
  static runPromise<Value>(effect: Effect.Effect<Value, CoreApiClientError>): Promise<Value>;
}
