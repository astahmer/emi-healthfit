import { Effect } from "effect";
import { ChatServer, ChatServerError } from "../use-cases/chat-server.ts";
import type { ChatServerOptions } from "../ports/chat-server.ts";

export class ChatServerEffect {
  private constructor() {}

  static create(options: ChatServerOptions): Effect.Effect<ChatServer, ChatServerError> {
    return Effect.succeed(new ChatServer(options));
  }
}
