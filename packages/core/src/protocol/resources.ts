import * as Schema from "effect/Schema";
import {
  ConversationIdSchema,
  MemoryIdSchema,
  MessageIdSchema,
  ThreadIdSchema,
  TimestampSchema,
} from "./ids.ts";

const title = Schema.NullOr(Schema.String);

const conversationFields = {
  id: ConversationIdSchema,
  title,
  status: Schema.Literals(["regular", "archived"]),
  pinned: Schema.Boolean,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
};

export const ConversationSchema = Schema.Struct(conversationFields);
export type Conversation = typeof ConversationSchema.Type;

export const ConversationDtoSchema = Schema.Struct(conversationFields);
export type ConversationDto = typeof ConversationDtoSchema.Type;

const threadFields = {
  id: ThreadIdSchema,
  conversationId: ConversationIdSchema,
  anchorMessageId: MessageIdSchema,
  title,
  status: Schema.Literals(["regular", "discarded", "merged"]),
  pinned: Schema.Boolean,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
};

export const ThreadSchema = Schema.Struct(threadFields);
export type Thread = typeof ThreadSchema.Type;

export const ThreadDtoSchema = Schema.Struct(threadFields);
export type ThreadDto = typeof ThreadDtoSchema.Type;

const memoryFields = {
  id: MemoryIdSchema,
  content: Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/)),
  source: Schema.NullOr(Schema.String),
  threadId: Schema.NullOr(ThreadIdSchema),
  createdAt: TimestampSchema,
  rank: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
};

export const MemorySchema = Schema.Struct(memoryFields);
export type Memory = typeof MemorySchema.Type;

export const MemoryDtoSchema = Schema.Struct(memoryFields);
export type MemoryDto = typeof MemoryDtoSchema.Type;

const memorySummaryFields = {
  content: Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/)),
  memoryCount: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  updatedAt: TimestampSchema,
};

export const MemorySummarySchema = Schema.Struct(memorySummaryFields);
export type MemorySummary = typeof MemorySummarySchema.Type;

export const MemorySummaryDtoSchema = Schema.Struct(memorySummaryFields);
export type MemorySummaryDto = typeof MemorySummaryDtoSchema.Type;
