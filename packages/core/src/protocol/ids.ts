import * as Schema from "effect/Schema";

const identifier = Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/^\S+$/));

export const ConversationIdSchema = identifier;
export type ConversationId = typeof ConversationIdSchema.Type;

export const MessageIdSchema = identifier;
export type MessageId = typeof MessageIdSchema.Type;

export const AttachmentIdSchema = identifier;
export type AttachmentId = typeof AttachmentIdSchema.Type;

export const ToolCallIdSchema = identifier;
export type ToolCallId = typeof ToolCallIdSchema.Type;

export const ThreadIdSchema = identifier;
export type ThreadId = typeof ThreadIdSchema.Type;

export const MemoryIdSchema = identifier;
export type MemoryId = typeof MemoryIdSchema.Type;

export const GenerationIdSchema = identifier;
export type GenerationId = typeof GenerationIdSchema.Type;

export const TimestampSchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/),
);
export type Timestamp = typeof TimestampSchema.Type;
