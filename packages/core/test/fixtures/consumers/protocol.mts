import { Effect } from "effect";
import { ChatProtocol } from "@emi/core/protocol";
import type {
  AttachmentId,
  ChatMessage,
  Conversation,
  ConversationDto,
  ErrorResponseDto,
  ExtensionPart,
  GenerationEvent,
  GenerationId,
  Memory,
  MemoryDto,
  MemoryId,
  MessageId,
  MessagePart,
  ModelProvider,
  Thread,
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
  conversation: string;
  generation: GenerationId;
  memory: MemoryId;
  message: MessageId;
  thread: ThreadId;
  timestamp: Timestamp;
  toolCall: ToolCallId;
};

const decodedConversation: Effect.Effect<Conversation, Error> =
  ChatProtocol.fromConversationDto(conversation);
const conversationPromise: Promise<Conversation> = ChatProtocol.runPromise(decodedConversation);
const decodedMessage: Effect.Effect<ChatMessage, Error> = ChatProtocol.fromChatMessageDto(message);
const messagePromise: Promise<ChatMessage> = ChatProtocol.runPromise(decodedMessage);
const decodedThread: Effect.Effect<Thread, Error> = ChatProtocol.fromThreadDto(thread);
const threadPromise: Promise<Thread> = ChatProtocol.runPromise(decodedThread);
const decodedMemory: Effect.Effect<Memory, Error> = ChatProtocol.fromMemoryDto(memory);
const memoryPromise: Promise<Memory> = ChatProtocol.runPromise(decodedMemory);
const errorPromise: Promise<ErrorResponseDto> = ChatProtocol.runPromise(
  ChatProtocol.decodeErrorResponseDto(errorResponse),
);

void ChatProtocol.schemas.attachment;
void ChatProtocol.schemas.chatMessage;
void ChatProtocol.schemas.conversation;
void ChatProtocol.schemas.errorResponseDto;
void ChatProtocol.schemas.generationEvent;
void ChatProtocol.schemas.messagePart;
void ChatProtocol.schemas.modelConfiguration;
void ChatProtocol.schemas.thread;
void ChatProtocol.schemas.memory;
void event;
void extensionPart;
void provider;
void ids;
void memory;
void thread;
void conversation;
void conversationPromise;
void messagePromise;
void threadPromise;
void memoryPromise;
void errorPromise;
