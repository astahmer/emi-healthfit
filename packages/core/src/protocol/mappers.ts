import { Effect } from "effect";
import * as Schema from "effect/Schema";

import { ErrorResponseDtoSchema, ProtocolDecodeError, type ErrorResponseDto } from "./errors.ts";
import {
  ChatMessageDtoSchema,
  ChatMessageSchema,
  type ChatMessage,
  type ChatMessageDto,
} from "./messages.ts";
import {
  AttachmentSchema,
  ExtensionPartSchema,
  MessagePartSchema,
  ToolCallSchema,
  ToolResultSchema,
} from "./parts.ts";
import {
  AttachmentIdSchema,
  ConversationIdSchema,
  GenerationIdSchema,
  MemoryIdSchema,
  MessageIdSchema,
  ThreadIdSchema,
  TimestampSchema,
  ToolCallIdSchema,
} from "./ids.ts";
import {
  ConversationDtoSchema,
  ConversationSchema,
  MemoryDtoSchema,
  MemorySchema,
  MemorySummaryDtoSchema,
  MemorySummarySchema,
  ThreadDtoSchema,
  ThreadSchema,
  type Conversation,
  type ConversationDto,
  type Memory,
  type MemoryDto,
  type MemorySummary,
  type MemorySummaryDto,
  type Thread,
  type ThreadDto,
} from "./resources.ts";
import {
  GenerationEventSchema,
  ModelCapabilitiesSchema,
  ModelConfigurationSchema,
  ModelDescriptorSchema,
  ModelGenerationInputSchema,
  type ModelProviderError,
} from "./model.ts";
import { MessageRoleSchema, MessageUsageSchema } from "./messages.ts";
import { TransportErrorSchema } from "./errors.ts";

const protocolSchemas = {
  attachment: AttachmentSchema,
  attachmentId: AttachmentIdSchema,
  conversationId: ConversationIdSchema,
  generationId: GenerationIdSchema,
  memoryId: MemoryIdSchema,
  messageId: MessageIdSchema,
  threadId: ThreadIdSchema,
  timestamp: TimestampSchema,
  toolCallId: ToolCallIdSchema,
  toolCall: ToolCallSchema,
  toolResult: ToolResultSchema,
  extensionPart: ExtensionPartSchema,
  messagePart: MessagePartSchema,
  chatMessage: ChatMessageSchema,
  chatMessageDto: ChatMessageDtoSchema,
  conversation: ConversationSchema,
  conversationDto: ConversationDtoSchema,
  thread: ThreadSchema,
  threadDto: ThreadDtoSchema,
  memory: MemorySchema,
  memoryDto: MemoryDtoSchema,
  memorySummary: MemorySummarySchema,
  memorySummaryDto: MemorySummaryDtoSchema,
  messageRole: MessageRoleSchema,
  messageUsage: MessageUsageSchema,
  generationEvent: GenerationEventSchema,
  errorResponseDto: ErrorResponseDtoSchema,
  modelCapabilities: ModelCapabilitiesSchema,
  modelConfiguration: ModelConfigurationSchema,
  modelDescriptor: ModelDescriptorSchema,
  modelGenerationInput: ModelGenerationInputSchema,
  transportError: TransportErrorSchema,
  modelProviderError: TransportErrorSchema,
} as const;

export type ProtocolSchemas = typeof protocolSchemas;
export type ProtocolEffect<Value> = Effect.Effect<Value, ProtocolDecodeError>;

export class ChatProtocol {
  static readonly schemas = protocolSchemas;

  static fromChatMessageDto(input: unknown): ProtocolEffect<ChatMessage> {
    return ChatProtocol.decode(ChatProtocol.schemas.chatMessageDto, input).pipe(
      Effect.map((value) => ChatProtocol.copyChatMessage(value)),
    );
  }

  static toChatMessageDto(input: ChatMessage): ProtocolEffect<ChatMessageDto> {
    return ChatProtocol.decode(ChatProtocol.schemas.chatMessage, input).pipe(
      Effect.map((value) => ChatProtocol.copyChatMessage(value)),
    );
  }

  static fromConversationDto(input: unknown): ProtocolEffect<Conversation> {
    return ChatProtocol.decode(ChatProtocol.schemas.conversationDto, input).pipe(
      Effect.map((value) => ({
        id: value.id,
        title: value.title,
        status: value.status,
        pinned: value.pinned,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      })),
    );
  }

  static toConversationDto(input: Conversation): ProtocolEffect<ConversationDto> {
    return ChatProtocol.decode(ChatProtocol.schemas.conversation, input).pipe(
      Effect.map((value) => ({
        id: value.id,
        title: value.title,
        status: value.status,
        pinned: value.pinned,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      })),
    );
  }

  static fromThreadDto(input: unknown): ProtocolEffect<Thread> {
    return ChatProtocol.decode(ChatProtocol.schemas.threadDto, input).pipe(
      Effect.map((value) => ({
        id: value.id,
        conversationId: value.conversationId,
        anchorMessageId: value.anchorMessageId,
        title: value.title,
        status: value.status,
        pinned: value.pinned,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      })),
    );
  }

  static toThreadDto(input: Thread): ProtocolEffect<ThreadDto> {
    return ChatProtocol.decode(ChatProtocol.schemas.thread, input).pipe(
      Effect.map((value) => ({
        id: value.id,
        conversationId: value.conversationId,
        anchorMessageId: value.anchorMessageId,
        title: value.title,
        status: value.status,
        pinned: value.pinned,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      })),
    );
  }

  static fromMemoryDto(input: unknown): ProtocolEffect<Memory> {
    return ChatProtocol.decode(ChatProtocol.schemas.memoryDto, input).pipe(
      Effect.map((value) => ({
        id: value.id,
        content: value.content,
        source: value.source,
        threadId: value.threadId,
        createdAt: value.createdAt,
        rank: value.rank,
      })),
    );
  }

  static toMemoryDto(input: Memory): ProtocolEffect<MemoryDto> {
    return ChatProtocol.decode(ChatProtocol.schemas.memory, input).pipe(
      Effect.map((value) => ({
        id: value.id,
        content: value.content,
        source: value.source,
        threadId: value.threadId,
        createdAt: value.createdAt,
        rank: value.rank,
      })),
    );
  }

  static fromMemorySummaryDto(input: unknown): ProtocolEffect<MemorySummary> {
    return ChatProtocol.decode(ChatProtocol.schemas.memorySummaryDto, input).pipe(
      Effect.map((value) => ({
        content: value.content,
        memoryCount: value.memoryCount,
        updatedAt: value.updatedAt,
      })),
    );
  }

  static toMemorySummaryDto(input: MemorySummary): ProtocolEffect<MemorySummaryDto> {
    return ChatProtocol.decode(ChatProtocol.schemas.memorySummary, input).pipe(
      Effect.map((value) => ({
        content: value.content,
        memoryCount: value.memoryCount,
        updatedAt: value.updatedAt,
      })),
    );
  }

  static decodeErrorResponseDto(input: unknown): ProtocolEffect<ErrorResponseDto> {
    return ChatProtocol.decode(ChatProtocol.schemas.errorResponseDto, input);
  }

  static decodeModelProviderError(input: unknown): ProtocolEffect<ModelProviderError> {
    return ChatProtocol.decode(ChatProtocol.schemas.modelProviderError, input);
  }

  static runPromise<Value, Error>(effect: Effect.Effect<Value, Error>): Promise<Value> {
    return Effect.runPromise(effect);
  }

  private static decode<SchemaType extends Schema.ConstraintDecoder<unknown>>(
    schema: SchemaType,
    input: unknown,
  ): ProtocolEffect<SchemaType["Type"]> {
    return Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError((error) => new ProtocolDecodeError({ message: error.message })),
    );
  }

  private static copyChatMessage(value: ChatMessage): ChatMessage {
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
  }
}
