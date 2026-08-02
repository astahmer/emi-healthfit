import type * as Effect from "effect/Effect";
import type { ChatServer, ChatServerError, ChatServerOptions } from "./server";

export declare class ChatServerEffect {
  private constructor();
  static create(options: ChatServerOptions): Effect.Effect<ChatServer, ChatServerError>;
}
