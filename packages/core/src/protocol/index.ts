import { AttachmentSchema } from "./parts.ts";
import { ChatMessageDtoSchema, ChatMessageSchema } from "./messages.ts";
import { ConversationDtoSchema, ConversationSchema } from "./resources.ts";
import { ErrorResponseDtoSchema, TransportErrorSchema } from "./errors.ts";
import {
  ExtensionPartSchema,
  MessagePartSchema,
  ToolCallSchema,
  ToolResultSchema,
} from "./parts.ts";
import {
  GenerationEventSchema,
  ModelConfigurationSchema,
  ModelGenerationInputSchema,
} from "./model.ts";
import { MemoryDtoSchema, MemorySchema, ThreadDtoSchema, ThreadSchema } from "./resources.ts";
import { MessageRoleSchema, MessageUsageSchema } from "./messages.ts";

export {
  AttachmentSchema,
  ChatMessageDtoSchema,
  ChatMessageSchema,
  ConversationDtoSchema,
  ConversationSchema,
  ErrorResponseDtoSchema,
  ExtensionPartSchema,
  GenerationEventSchema,
  MemoryDtoSchema,
  MemorySchema,
  MessageRoleSchema,
  MessagePartSchema,
  MessageUsageSchema,
  ModelConfigurationSchema,
  ModelGenerationInputSchema,
  ThreadDtoSchema,
  ThreadSchema,
  ToolCallSchema,
  ToolResultSchema,
  TransportErrorSchema,
};

export type {
  Attachment,
  ExtensionPart,
  FileMessagePart,
  MessagePart,
  ReasoningMessagePart,
  TextMessagePart,
  ToolCall,
  ToolCallMessagePart,
  ToolResult,
  ToolResultMessagePart,
} from "./parts.ts";
export type { ChatMessage, ChatMessageDto, MessageRole, MessageUsage } from "./messages.ts";
export type {
  Conversation,
  ConversationDto,
  Memory,
  MemoryDto,
  Thread,
  ThreadDto,
} from "./resources.ts";
export type {
  AttachmentId,
  ConversationId,
  GenerationId,
  MemoryId,
  MessageId,
  ToolCallId,
  ThreadId,
  Timestamp,
} from "./ids.ts";
export type {
  GenerationEvent,
  ModelConfiguration,
  ModelGenerationInput,
  ModelProvider,
  TransportError,
} from "./model.ts";
export type { ErrorResponseDto } from "./errors.ts";
export { ProtocolDecodeError } from "./errors.ts";
export {
  decodeErrorResponseDto,
  fromChatMessageDto,
  fromConversationDto,
  fromMemoryDto,
  fromThreadDto,
  toChatMessageDto,
  toConversationDto,
  toMemoryDto,
  toThreadDto,
} from "./mappers.ts";

export {
  AttachmentIdSchema,
  ConversationIdSchema,
  GenerationIdSchema,
  MemoryIdSchema,
  MessageIdSchema,
  ToolCallIdSchema,
  ThreadIdSchema,
  TimestampSchema,
} from "./ids.ts";

export interface ProtocolSchemas {
  readonly attachment: typeof AttachmentSchema;
  readonly toolCall: typeof ToolCallSchema;
  readonly toolResult: typeof ToolResultSchema;
  readonly extensionPart: typeof ExtensionPartSchema;
  readonly messagePart: typeof MessagePartSchema;
  readonly chatMessage: typeof ChatMessageSchema;
  readonly chatMessageDto: typeof ChatMessageDtoSchema;
  readonly conversationDto: typeof ConversationDtoSchema;
  readonly threadDto: typeof ThreadDtoSchema;
  readonly memoryDto: typeof MemoryDtoSchema;
  readonly generationEvent: typeof GenerationEventSchema;
  readonly errorResponseDto: typeof ErrorResponseDtoSchema;
  readonly modelConfiguration: typeof ModelConfigurationSchema;
}

export const protocolSchemas = {
  attachment: AttachmentSchema,
  toolCall: ToolCallSchema,
  toolResult: ToolResultSchema,
  extensionPart: ExtensionPartSchema,
  messagePart: MessagePartSchema,
  chatMessage: ChatMessageSchema,
  chatMessageDto: ChatMessageDtoSchema,
  conversationDto: ConversationDtoSchema,
  threadDto: ThreadDtoSchema,
  memoryDto: MemoryDtoSchema,
  generationEvent: GenerationEventSchema,
  errorResponseDto: ErrorResponseDtoSchema,
  modelConfiguration: ModelConfigurationSchema,
} satisfies ProtocolSchemas;
