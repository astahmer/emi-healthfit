import type * as Effect from "effect/Effect";
import type { ChatServer, ChatServerError, ChatServerOptions } from "./server";

export type EffectChatServer = Effect.Effect<ChatServer, ChatServerError, never>;

export declare const createEffectChatServer: (
  options: ChatServerOptions,
) => Effect.Effect<ChatServer, ChatServerError, never>;
