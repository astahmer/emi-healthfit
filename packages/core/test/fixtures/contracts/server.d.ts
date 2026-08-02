import type * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import type {
  ChatMessage,
  Conversation,
  GenerationEvent,
  ModelConfiguration,
} from "./protocol";

export declare class ChatServerError extends Error {
  readonly kind: "unauthorized" | "conflict" | "invalid-input" | "internal";
}

export interface ChatServerShape {
  readonly listConversations: (
    request: Request,
  ) => Effect.Effect<ReadonlyArray<Conversation>, ChatServerError>;
  readonly generate: (
    request: Request,
    input: {
      readonly requestId: string;
      readonly conversationId: string;
      readonly message: ChatMessage;
    },
  ) => Stream.Stream<GenerationEvent, ChatServerError>;
  readonly handle: (request: Request) => Effect.Effect<Response, ChatServerError>;
}

export declare class ChatServer extends Context.Service<ChatServer, ChatServerShape>()(
  "@emi/core/server/ChatServer",
) {}

export type ChatServerModelConfiguration = ModelConfiguration;
