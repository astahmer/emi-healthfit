import type * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import type { ChatServer } from "./server";

export interface ChatFetchHandlersShape {
  readonly handle: (request: Request) => Effect.Effect<Response>;
}

export declare class ChatFetchHandlers extends Context.Service<
  ChatFetchHandlers,
  ChatFetchHandlersShape
>()("@emi/core/server/ChatFetchHandlers") {
  static layer(): Layer.Layer<ChatFetchHandlers, never, ChatServer>;
  static handle(input: {
    readonly layer: Layer.Layer<ChatFetchHandlers, never, never>;
    readonly request: Request;
  }): Promise<Response>;
}
