import { Effect } from "effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChatProtocol } from "../../protocol/index.ts";
import type { ChatMessage, Conversation, GenerationEvent } from "../../protocol/index.ts";
import type { ChatServerOptions } from "../ports/chat-server.ts";

const ChatGenerationInputSchema = Schema.Struct({
  requestId: Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/)),
  conversationId: ChatProtocol.schemas.conversationId,
  message: ChatProtocol.schemas.chatMessage,
});

export class ChatServerError extends Schema.TaggedErrorClass<ChatServerError>()("ChatServerError", {
  kind: Schema.Literals(["unauthorized", "conflict", "invalid-input", "internal"]),
  message: Schema.String,
}) {}

export class ChatServer {
  private readonly options: ChatServerOptions;

  constructor(options: ChatServerOptions) {
    this.options = options;
  }

  listConversations(request: Request): Effect.Effect<ReadonlyArray<Conversation>, ChatServerError> {
    const options = this.options;
    return Effect.gen(function* () {
      const principal = yield* options.auth.authenticate(request);
      return yield* options.repositories.conversations.list({ subject: principal.subject });
    });
  }

  generate(
    request: Request,
    input: {
      readonly requestId: string;
      readonly conversationId: string;
      readonly message: ChatMessage;
    },
  ): Stream.Stream<GenerationEvent, ChatServerError> {
    const options = this.options;
    return Stream.unwrap(
      Effect.gen(function* () {
        const decodedInput = yield* Schema.decodeUnknownEffect(ChatGenerationInputSchema)(
          input,
        ).pipe(
          Effect.mapError(
            (error) =>
              new ChatServerError({
                kind: "invalid-input",
                message: error.message,
              }),
          ),
        );
        const principal = yield* options.auth.authenticate(request);
        yield* options.repositories.generations.admit({
          subject: principal.subject,
          requestId: decodedInput.requestId,
          conversationId: decodedInput.conversationId,
        });
        yield* options.repositories.messages.append({
          subject: principal.subject,
          conversationId: decodedInput.conversationId,
          message: decodedInput.message,
        });
        return options.model
          .generate({
            subject: principal.subject,
            messages: [decodedInput.message],
            configuration: options.configuration,
          })
          .pipe(
            Stream.tap((event) =>
              options.repositories.generations.append({
                subject: principal.subject,
                requestId: decodedInput.requestId,
                event,
              }),
            ),
          );
      }),
    );
  }

  handle(request: Request): Effect.Effect<Response, ChatServerError> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/conversations") {
      return this.listConversations(request).pipe(
        Effect.flatMap((conversations) =>
          Effect.forEach(conversations, (conversation) =>
            ChatProtocol.toConversationDto(conversation).pipe(
              Effect.mapError(
                (error) =>
                  new ChatServerError({
                    kind: "internal",
                    message: error.message,
                  }),
              ),
            ),
          ),
        ),
        Effect.map((conversations) => Response.json(conversations)),
      );
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      return Effect.succeed(Response.json({ ok: true }));
    }
    return Effect.fail(
      new ChatServerError({
        kind: "invalid-input",
        message: `Unsupported request: ${request.method} ${url.pathname}`,
      }),
    );
  }
}

export type { ChatServerOptions } from "../ports/chat-server.ts";
