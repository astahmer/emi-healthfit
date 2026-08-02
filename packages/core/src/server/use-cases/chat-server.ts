import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChatProtocol } from "../../protocol.export.ts";
import type { ChatMessage, Conversation, GenerationEvent } from "../../protocol.export.ts";
import {
  AuthPort,
  ChatModel,
  ChatRepositories,
  ChatServerConfiguration,
} from "../ports/chat-server.ts";

const ChatGenerationInputSchema = Schema.Struct({
  requestId: Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/)),
  conversationId: ChatProtocol.schemas.conversationId,
  message: ChatProtocol.schemas.chatMessage,
});

export class ChatServerError extends Schema.TaggedErrorClass<ChatServerError>()("ChatServerError", {
  kind: Schema.Literals(["unauthorized", "conflict", "invalid-input", "internal"]),
  message: Schema.String,
}) {}

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

export class ChatServer extends Context.Service<ChatServer, ChatServerShape>()(
  "@emi/core/server/ChatServer",
) {}

export const ChatServerLive = Layer.effect(
  ChatServer,
  Effect.gen(function* () {
    const auth = yield* AuthPort;
    const repositories = yield* ChatRepositories;
    const model = yield* ChatModel;
    const configuration = yield* ChatServerConfiguration;

    const listConversations = (request: Request) =>
      Effect.gen(function* () {
        const principal = yield* auth.authenticate(request);
        return yield* repositories.conversations.list({ subject: principal.subject });
      });

    const generate = (
      request: Request,
      input: {
        readonly requestId: string;
        readonly conversationId: string;
        readonly message: ChatMessage;
      },
    ) =>
      Stream.unwrap(
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
          const principal = yield* auth.authenticate(request);
          yield* repositories.generations.admit({
            subject: principal.subject,
            requestId: decodedInput.requestId,
            conversationId: decodedInput.conversationId,
            model: configuration.model.model,
          });
          yield* repositories.messages.append({
            subject: principal.subject,
            conversationId: decodedInput.conversationId,
            message: decodedInput.message,
          });
          return model
            .generate({
              subject: principal.subject,
              messages: [decodedInput.message],
              configuration: configuration.model,
            })
            .pipe(
              Stream.tap((event) =>
                repositories.generations.append({
                  subject: principal.subject,
                  requestId: decodedInput.requestId,
                  event,
                }),
              ),
            );
        }),
      );

    const handle = (request: Request) => {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/api/conversations") {
        return listConversations(request).pipe(
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
    };

    return { listConversations, generate, handle } satisfies ChatServerShape;
  }),
);
