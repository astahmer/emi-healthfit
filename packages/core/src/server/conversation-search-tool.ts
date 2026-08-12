import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Tool from "effect/unstable/ai/Tool";
import type { ConversationMessageSearchResult } from "./db/conversations.ts";
import { ConversationReader } from "./ports/conversation-store.ts";
import { ToolSchema } from "./tool-schema.ts";

const ConversationSearchInput = Schema.Struct({
  query: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "Specific words or a short phrase to search in previous conversation messages.",
  }),
  limit: ToolSchema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 })).annotate({
      description: "Maximum number of matching messages to return (default 10).",
    }),
  ),
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

const conversationSearchTool = Tool.make("search_conversations", {
  description:
    "Search message content in previous saved conversations. Use this when the user asks what they said, decided, or discussed in an earlier chat. Do not guess past details when this search can verify them.",
  parameters: ConversationSearchInput,
  success: Schema.Unknown,
  failure: Schema.Unknown,
});

export class ConversationSearchTool {
  static readonly name = conversationSearchTool.name;
  static readonly description = Tool.getDescription(conversationSearchTool) ?? "";
  static readonly input = ConversationSearchInput;
  static readonly definition = {
    name: conversationSearchTool.name,
    description: ConversationSearchTool.description,
    parameters: Tool.getJsonSchema(conversationSearchTool),
  };

  static execute = Effect.fn("core.conversation.searchTool")(function* ({
    args,
    excludeConversationId,
  }: {
    readonly args: unknown;
    readonly excludeConversationId?: string;
  }) {
    const conversationReader = yield* ConversationReader;
    const input = yield* Schema.decodeUnknownEffect(ConversationSearchInput)(args).pipe(
      Effect.mapError(
        (error) =>
          new ConversationSearchToolError({
            kind: "invalid-input",
            message: error.message,
          }),
      ),
    );
    const results = yield* conversationReader.searchMessages({
      query: input.query,
      limit: input.limit ?? 10,
      excludeConversationId,
    });
    return {
      results: yield* Effect.forEach(results, toToolResult),
    };
  });
}
