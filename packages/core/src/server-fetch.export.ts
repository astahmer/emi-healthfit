import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ChatServer, ChatServerError } from "./server/use-cases/chat-server.ts";

export interface ChatFetchHandlersShape {
  readonly handle: (request: Request) => Effect.Effect<Response, ChatServerError>;
}

export class ChatFetchHandlers extends Context.Service<ChatFetchHandlers, ChatFetchHandlersShape>()(
  "@emi/core/server/ChatFetchHandlers",
) {
  static layer() {
    return Layer.effect(
      ChatFetchHandlers,
      Effect.gen(function* () {
        const server = yield* ChatServer;
        return {
          handle: (request: Request) => server.handle(request),
        } satisfies ChatFetchHandlersShape;
      }),
    );
  }

  static handle({
    layer,
    request,
  }: {
    readonly layer: Layer.Layer<ChatFetchHandlers, never, never>;
    readonly request: Request;
  }): Promise<Response> {
    return Effect.runPromise(
      ChatFetchHandlers.use((handlers) => handlers.handle(request)).pipe(
        Effect.provide(layer),
        Effect.catch((error) => Effect.succeed(ChatFetchHandlers.toErrorResponse(error))),
      ),
    );
  }

  private static toErrorResponse(error: ChatServerError): Response {
    const status =
      error.kind === "unauthorized"
        ? 401
        : error.kind === "conflict"
          ? 409
          : error.kind === "invalid-input"
            ? 400
            : 500;
    return Response.json({ error: { kind: error.kind, message: error.message } }, { status });
  }
}
