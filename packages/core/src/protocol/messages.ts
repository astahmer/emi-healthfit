import * as Schema from "effect/Schema";
import { MessageIdSchema, TimestampSchema } from "./ids.ts";
import { MessagePartSchema } from "./parts.ts";

export const MessageRoleSchema = Schema.Literals([
  "user",
  "assistant",
  "system",
  "summary",
  "tool",
]);
export type MessageRole = typeof MessageRoleSchema.Type;

const tokenCount = Schema.NullOr(
  Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
);

export const MessageUsageSchema = Schema.Struct({
  promptTokens: tokenCount,
  completionTokens: tokenCount,
  totalTokens: tokenCount,
});
export type MessageUsage = typeof MessageUsageSchema.Type;

const chatMessageFields = {
  id: MessageIdSchema,
  role: MessageRoleSchema,
  parts: Schema.Array(MessagePartSchema),
  createdAt: TimestampSchema,
  model: Schema.optional(Schema.String),
  usage: Schema.optional(MessageUsageSchema),
};

export const ChatMessageSchema = Schema.Struct(chatMessageFields);
export type ChatMessage = typeof ChatMessageSchema.Type;

export const ChatMessageDtoSchema = Schema.Struct(chatMessageFields);
export type ChatMessageDto = typeof ChatMessageDtoSchema.Type;
