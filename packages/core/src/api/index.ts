import { Effect } from "effect";
import * as Schema from "effect/Schema";

import { ChatProtocol, type ChatMessage, type Conversation } from "../protocol/index.ts";

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/$/, "");

export interface CoreApiClientOptions {
  readonly baseUrl: string;
  readonly fetch: typeof globalThis.fetch;
}

export class CoreApiClientError extends Schema.TaggedErrorClass<CoreApiClientError>()(
  "CoreApiClientError",
  {
    kind: Schema.Literals(["network", "http", "decode"]),
    message: Schema.String,
  },
) {}

type ApiEffect<Value> = Effect.Effect<Value, CoreApiClientError>;

export class CoreApiClient {
  readonly conversations: {
    readonly list: () => ApiEffect<ReadonlyArray<Conversation>>;
  };
  readonly messages: {
    readonly list: (input: {
      readonly conversationId: string;
    }) => ApiEffect<ReadonlyArray<ChatMessage>>;
  };

  private readonly baseUrl: string;
  private readonly fetch: typeof globalThis.fetch;

  private constructor(options: CoreApiClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetch = options.fetch;
    this.conversations = { list: () => this.listConversations() };
    this.messages = { list: (input) => this.listMessages(input) };
  }

  static create(options: CoreApiClientOptions): CoreApiClient {
    return new CoreApiClient(options);
  }

  static runPromise<Value>(effect: Effect.Effect<Value, CoreApiClientError>): Promise<Value> {
    return Effect.runPromise(effect);
  }

  private requestJson(path: string): ApiEffect<unknown> {
    return Effect.tryPromise({
      try: async () => {
        const response = await this.fetch(`${this.baseUrl}${path}`);
        if (!response.ok) {
          throw new CoreApiClientError({
            kind: "http",
            message: `Core API returned HTTP ${response.status}.`,
          });
        }
        return response.json();
      },
      catch: (error) =>
        error instanceof CoreApiClientError
          ? error
          : new CoreApiClientError({
              kind: "network",
              message: error instanceof Error ? error.message : "Core API request failed.",
            }),
    });
  }

  private listConversations(): ApiEffect<ReadonlyArray<Conversation>> {
    return this.requestJson("/conversations").pipe(
      Effect.flatMap((input) =>
        Schema.decodeUnknownEffect(Schema.Array(ChatProtocol.schemas.conversationDto))(input).pipe(
          Effect.mapError(
            (error) =>
              new CoreApiClientError({
                kind: "decode",
                message: error.message,
              }),
          ),
          Effect.map((conversations) =>
            conversations.map((conversation) => ({
              id: conversation.id,
              title: conversation.title,
              status: conversation.status,
              pinned: conversation.pinned,
              createdAt: conversation.createdAt,
              updatedAt: conversation.updatedAt,
            })),
          ),
        ),
      ),
    );
  }

  private listMessages(input: {
    readonly conversationId: string;
  }): ApiEffect<ReadonlyArray<ChatMessage>> {
    const conversationId = encodeURIComponent(input.conversationId);
    return this.requestJson(`/conversations/${conversationId}/messages`).pipe(
      Effect.flatMap((payload) =>
        Schema.decodeUnknownEffect(Schema.Array(ChatProtocol.schemas.chatMessageDto))(payload).pipe(
          Effect.mapError(
            (error) =>
              new CoreApiClientError({
                kind: "decode",
                message: error.message,
              }),
          ),
          Effect.map((messages) =>
            messages.map((message) => ({
              id: message.id,
              role: message.role,
              parts: [...message.parts],
              createdAt: message.createdAt,
              ...(message.model === undefined ? {} : { model: message.model }),
              ...(message.usage === undefined ? {} : { usage: { ...message.usage } }),
            })),
          ),
        ),
      ),
    );
  }
}
