import { Effect } from "effect";
import { ChatServer, ChatServerError } from "../use-cases/chat-server.ts";

export class ChatFetchHandlers {
  private readonly server: ChatServer;

  constructor(server: ChatServer) {
    this.server = server;
  }

  handle(request: Request): Promise<Response> {
    return Effect.runPromise(
      this.server
        .handle(request)
        .pipe(Effect.catch((error) => Effect.succeed(ChatFetchHandlers.toErrorResponse(error)))),
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
