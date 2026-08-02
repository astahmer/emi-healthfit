import {
  AttachmentSchema,
  ChatMessageDtoSchema,
  ChatMessageSchema,
  ConversationDtoSchema,
  ErrorResponseDtoSchema,
  ExtensionPartSchema,
  GenerationEventSchema,
  MemoryDtoSchema,
  MessagePartSchema,
  ModelConfigurationSchema,
  ThreadDtoSchema,
  ToolCallSchema,
  ToolResultSchema,
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
  ConversationDto,
  ErrorResponseDto,
  ExtensionPart,
  GenerationEvent,
  MemoryDto,
  MessagePart,
  ModelProvider,
  ThreadDto,
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

void AttachmentSchema;
void ChatMessageDtoSchema;
void ChatMessageSchema;
void ConversationDtoSchema;
void ErrorResponseDtoSchema;
void ExtensionPartSchema;
void GenerationEventSchema;
void MemoryDtoSchema;
void MessagePartSchema;
void ModelConfigurationSchema;
void ThreadDtoSchema;
void ToolCallSchema;
void ToolResultSchema;
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
