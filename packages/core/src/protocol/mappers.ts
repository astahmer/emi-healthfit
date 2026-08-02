import * as Schema from "effect/Schema";
import { ErrorResponseDtoSchema, ProtocolDecodeError, type ErrorResponseDto } from "./errors.ts";
import {
  ChatMessageDtoSchema,
  ChatMessageSchema,
  type ChatMessage,
  type ChatMessageDto,
} from "./messages.ts";
import {
  ConversationDtoSchema,
  ConversationSchema,
  MemoryDtoSchema,
  MemorySchema,
  ThreadDtoSchema,
  ThreadSchema,
  type Conversation,
  type ConversationDto,
  type Memory,
  type MemoryDto,
  type Thread,
  type ThreadDto,
} from "./resources.ts";

const decode = <SchemaType extends Schema.ConstraintDecoder<unknown>>(
  schema: SchemaType,
  input: unknown,
): SchemaType["Type"] => {
  try {
    return Schema.decodeUnknownSync(schema)(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Protocol value failed validation.";
    throw new ProtocolDecodeError({ message });
  }
};

const copyChatMessage = (value: ChatMessage): ChatMessage => {
  const base = {
    id: value.id,
    role: value.role,
    parts: [...value.parts],
    createdAt: value.createdAt,
  };
  const usage = value.usage;
  if (value.model === undefined && usage === undefined) return base;
  if (value.model !== undefined && usage !== undefined) {
    return {
      ...base,
      model: value.model,
      usage: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      },
    };
  }
  if (value.model !== undefined) return { ...base, model: value.model };
  if (usage === undefined) return base;
  return {
    ...base,
    usage: {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
    },
  };
};

export const fromChatMessageDto = (input: unknown): ChatMessage =>
  copyChatMessage(decode(ChatMessageDtoSchema, input));

export const toChatMessageDto = (input: ChatMessage): ChatMessageDto =>
  copyChatMessage(decode(ChatMessageSchema, input));

export const fromConversationDto = (input: unknown): Conversation => {
  const value = decode(ConversationDtoSchema, input);
  return {
    id: value.id,
    title: value.title,
    status: value.status,
    pinned: value.pinned,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
};

export const toConversationDto = (input: Conversation): ConversationDto => {
  const value = decode(ConversationSchema, input);
  return {
    id: value.id,
    title: value.title,
    status: value.status,
    pinned: value.pinned,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
};

export const fromThreadDto = (input: unknown): Thread => {
  const value = decode(ThreadDtoSchema, input);
  return {
    id: value.id,
    conversationId: value.conversationId,
    anchorMessageId: value.anchorMessageId,
    title: value.title,
    status: value.status,
    pinned: value.pinned,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
};

export const toThreadDto = (input: Thread): ThreadDto => {
  const value = decode(ThreadSchema, input);
  return {
    id: value.id,
    conversationId: value.conversationId,
    anchorMessageId: value.anchorMessageId,
    title: value.title,
    status: value.status,
    pinned: value.pinned,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
};

export const fromMemoryDto = (input: unknown): Memory => {
  const value = decode(MemoryDtoSchema, input);
  return {
    id: value.id,
    content: value.content,
    source: value.source,
    threadId: value.threadId,
    createdAt: value.createdAt,
    rank: value.rank,
  };
};

export const toMemoryDto = (input: Memory): MemoryDto => {
  const value = decode(MemorySchema, input);
  return {
    id: value.id,
    content: value.content,
    source: value.source,
    threadId: value.threadId,
    createdAt: value.createdAt,
    rank: value.rank,
  };
};

export const decodeErrorResponseDto = (input: unknown): ErrorResponseDto =>
  decode(ErrorResponseDtoSchema, input);
