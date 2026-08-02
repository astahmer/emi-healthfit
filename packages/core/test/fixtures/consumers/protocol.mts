import {
  AttachmentSchema,
  AttachmentIdSchema,
  ChatMessageDtoSchema,
  ChatMessageSchema,
  ConversationIdSchema,
  ConversationDtoSchema,
  ErrorResponseDtoSchema,
  ExtensionPartSchema,
  GenerationEventSchema,
  GenerationIdSchema,
  MemoryDtoSchema,
  MemoryIdSchema,
  MessagePartSchema,
  MessageIdSchema,
  ModelConfigurationSchema,
  ThreadDtoSchema,
  ThreadIdSchema,
  ToolCallSchema,
  ToolCallIdSchema,
  ToolResultSchema,
  TimestampSchema,
  fromChatMessageDto,
  fromConversationDto,
  fromMemoryDto,
  fromThreadDto,
  ProtocolDecodeError,
  protocolSchemas,
  toChatMessageDto,
  toConversationDto,
  toMemoryDto,
  toThreadDto,
} from "@emi/core/protocol";
import type {
  ChatMessage,
  AttachmentId,
  ConversationId,
  GenerationId,
  MemoryId,
  MessageId,
  ConversationDto,
  ErrorResponseDto,
  ExtensionPart,
  GenerationEvent,
  MemoryDto,
  MessagePart,
  ModelProvider,
  ThreadDto,
  ThreadId,
  Timestamp,
  ToolCallId,
} from "@emi/core/protocol";

const part: MessagePart = { type: "text", text: "hello" };
const message: ChatMessage = {
  id: "message-1",
  role: "user",
  parts: [part],
  createdAt: "2026-08-02T00:00:00.000Z",
};
const event: GenerationEvent = { type: "completed", message };
const extensionPart: ExtensionPart = {
  type: "extension",
  namespace: "example.chat",
  name: "citation",
  data: { sourceId: "source-1" },
};
declare const provider: ModelProvider;
declare const conversation: ConversationDto;
declare const thread: ThreadDto;
declare const memory: MemoryDto;
declare const errorResponse: ErrorResponseDto;
declare const ids: {
  attachment: AttachmentId;
  conversation: ConversationId;
  generation: GenerationId;
  memory: MemoryId;
  message: MessageId;
  thread: ThreadId;
  timestamp: Timestamp;
  toolCall: ToolCallId;
};

void AttachmentSchema;
void AttachmentIdSchema;
void ChatMessageDtoSchema;
void ChatMessageSchema;
void ConversationIdSchema;
void ConversationDtoSchema;
void ErrorResponseDtoSchema;
void ExtensionPartSchema;
void GenerationEventSchema;
void GenerationIdSchema;
void MemoryDtoSchema;
void MemoryIdSchema;
void MessagePartSchema;
void MessageIdSchema;
void ModelConfigurationSchema;
void ThreadDtoSchema;
void ThreadIdSchema;
void ToolCallSchema;
void ToolCallIdSchema;
void ToolResultSchema;
void TimestampSchema;
void fromChatMessageDto;
void ProtocolDecodeError;
void fromConversationDto;
void fromMemoryDto;
void fromThreadDto;
void protocolSchemas;
void event;
void extensionPart;
void provider;
void toChatMessageDto;
void toConversationDto;
void toMemoryDto;
void toThreadDto;
void conversation;
void thread;
void memory;
void errorResponse;
void ids;
