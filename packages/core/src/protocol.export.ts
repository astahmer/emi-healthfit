import type {
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
} from "./protocol/parts.ts";
import type {
  ChatMessage,
  ChatMessageDto,
  MessageRole,
  MessageUsage,
} from "./protocol/messages.ts";
import type {
  Conversation,
  ConversationDto,
  Memory,
  MemoryDto,
  Thread,
  ThreadDto,
} from "./protocol/resources.ts";
import type {
  AttachmentId,
  GenerationId,
  MemoryId,
  MessageId,
  ToolCallId,
  ThreadId,
  Timestamp,
} from "./protocol/ids.ts";
import type {
  GenerationEvent,
  ModelConfiguration,
  ModelGenerationInput,
  ModelProvider,
  ModelProviderError,
} from "./protocol/model.ts";
import type { TransportError } from "./protocol/errors.ts";
import { ProtocolDecodeError } from "./protocol/errors.ts";
import { ChatProtocol } from "./protocol/mappers.ts";
import type { ProtocolEffect, ProtocolSchemas } from "./protocol/mappers.ts";

export type {
  Attachment,
  AttachmentId,
  ChatMessage,
  ChatMessageDto,
  Conversation,
  ConversationDto,
  ExtensionPart,
  FileMessagePart,
  GenerationEvent,
  GenerationId,
  Memory,
  MemoryDto,
  MemoryId,
  MessageId,
  MessagePart,
  MessageRole,
  MessageUsage,
  ModelConfiguration,
  ModelGenerationInput,
  ModelProvider,
  ModelProviderError,
  ReasoningMessagePart,
  TextMessagePart,
  Thread,
  ThreadDto,
  ThreadId,
  Timestamp,
  ToolCall,
  ToolCallId,
  ToolCallMessagePart,
  ToolResult,
  ToolResultMessagePart,
  TransportError,
  ProtocolEffect,
  ProtocolSchemas,
};

export { ChatProtocol, ProtocolDecodeError };
