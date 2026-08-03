import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { JSONSchema7 } from "json-schema";
import type { ConversationMessageSearchResult } from "./db/conversations.ts";
import type { ConversationReaderShape } from "./ports/conversation-store.ts";

const ConversationSearchInput = Schema.Struct({
  query: Schema.String.check(Schema.isMinLength(1)),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }))),
});

const StoredParts = Schema.fromJsonString(Schema.Array(Schema.Unknown));

export class ConversationSearchToolError extends Schema.TaggedErrorClass<ConversationSearchToolError>()(
  "ConversationSearchToolError",
  {
    kind: Schema.Literals(["invalid-input", "invalid-message"]),
    message: Schema.String,
  },
) {}

const toToolResult = (result: ConversationMessageSearchResult) =>
  Schema.decodeUnknownEffect(StoredParts)(result.message.parts).pipe(
    Effect.map((parts) => ({
      conversation_id: result.conversation.id,
      conversation_title: result.conversation.title,
      message_id: result.message.id,
      message_role: result.message.role,
      parts,
    })),
    Effect.mapError(
      (error) =>
        new ConversationSearchToolError({
          kind: "invalid-message",
          message: error.message,
        }),
    ),
  );

export class ConversationSearchTool {
  static readonly name = "search_conversations";
  static readonly description =
    "Search message content in previous saved conversations. Use this when the user asks what they said, decided, or discussed in an earlier chat. Do not guess past details when this search can verify them.";
  static readonly input = ConversationSearchInput;
  static readonly definition = {
    name: ConversationSearchTool.name,
    description: ConversationSearchTool.description,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Specific words or a short phrase to search in previous conversation messages.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "Maximum number of matching messages to return (default 10).",
        },
      },
      required: ["query"],
      additionalProperties: false,
    } satisfies JSONSchema7,
  } as const;

  static execute = Effect.fn("core.conversation.searchTool")(function* ({
    searchMessages,
    args,
    excludeConversationId,
  }: {
    readonly searchMessages: ConversationReaderShape["searchMessages"];
    readonly args: unknown;
    readonly excludeConversationId?: string;
  }) {
    const input = yield* Schema.decodeUnknownEffect(ConversationSearchInput)(args).pipe(
      Effect.mapError(
        (error) =>
          new ConversationSearchToolError({
            kind: "invalid-input",
            message: error.message,
          }),
      ),
    );
    const results = yield* searchMessages({
      query: input.query,
      limit: input.limit ?? 10,
      excludeConversationId,
    });
    return {
      results: yield* Effect.forEach(results, toToolResult),
    };
  });
}
