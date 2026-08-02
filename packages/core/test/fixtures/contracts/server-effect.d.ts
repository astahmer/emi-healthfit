import type * as Layer from "effect/Layer";
import type { ChatServer } from "./server";

export declare class ChatServerEffect {
  static readonly Server: typeof ChatServer;
  static readonly Live: Layer.Layer<ChatServer, never, never>;
}
