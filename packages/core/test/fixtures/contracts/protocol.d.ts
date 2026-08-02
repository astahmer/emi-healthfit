export interface Attachment {
  readonly id: string;
  readonly name: string;
  readonly mediaType: string;
  readonly url: string;
  readonly size?: number;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface ToolResult {
  readonly callId: string;
  readonly output: JsonValue;
  readonly isError?: boolean;
}

export interface ExtensionPart {
  readonly type: "extension";
  readonly namespace: string;
  readonly name: string;
  readonly data: JsonValue;
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };

export type AttachmentId = string;
export type ConversationId = string;
export type GenerationId = string;
export type MemoryId = string;
export type MessageId = string;
export type ThreadId = string;
export type ToolCallId = string;
export type Timestamp = string;

export type MessagePart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "reasoning"; readonly text: string }
  | { readonly type: "file"; readonly file: Attachment }
  | { readonly type: "tool-call"; readonly call: ToolCall }
  | { readonly type: "tool-result"; readonly result: ToolResult };

export interface ChatMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system" | "tool";
  readonly parts: ReadonlyArray<MessagePart>;
  readonly createdAt: string;
  readonly model?: string;
  readonly usage?: MessageUsage;
}

export type ChatMessageDto = ChatMessage;

export interface MessageUsage {
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly totalTokens: number | null;
}

export interface ConversationDto {
  readonly id: string;
  readonly title: string | null;
  readonly status: "regular" | "archived";
  readonly pinned: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type Conversation = ConversationDto;

export interface ThreadDto {
  readonly id: string;
  readonly conversationId: string;
  readonly anchorMessageId: string;
  readonly title: string | null;
  readonly status: "regular" | "discarded" | "merged";
  readonly pinned: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type Thread = ThreadDto;

export interface MemoryDto {
  readonly id: string;
  readonly content: string;
  readonly source: string | null;
  readonly threadId: string | null;
  readonly createdAt: string;
  readonly rank: number;
}

export type Memory = MemoryDto;

export interface ModelConfiguration {
  readonly model: string;
  readonly provider?: string;
  readonly temperature?: number;
}

export type GenerationEvent =
  | { readonly type: "started"; readonly generationId: string }
  | { readonly type: "message-part"; readonly part: MessagePart }
  | { readonly type: "completed"; readonly message: ChatMessage }
  | { readonly type: "failed"; readonly error: TransportError };

export interface TransportError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: JsonValue;
}

export interface ErrorResponseDto {
  readonly error: TransportError;
}

export interface ModelGenerationInput {
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly configuration: ModelConfiguration;
}

export interface ModelProvider {
  readonly generate: (input: ModelGenerationInput) => AsyncIterable<GenerationEvent>;
}

export declare const AttachmentSchema: unknown;
export declare const AttachmentIdSchema: unknown;
export declare const ConversationIdSchema: unknown;
export declare const GenerationIdSchema: unknown;
export declare const MemoryIdSchema: unknown;
export declare const MessageIdSchema: unknown;
export declare const ThreadIdSchema: unknown;
export declare const TimestampSchema: unknown;
export declare const ToolCallIdSchema: unknown;
export declare const ToolCallSchema: unknown;
export declare const ToolResultSchema: unknown;
export declare const ExtensionPartSchema: unknown;
export declare const MessagePartSchema: unknown;
export declare const ChatMessageSchema: unknown;
export declare const ChatMessageDtoSchema: unknown;
export declare const ConversationDtoSchema: unknown;
export declare const ConversationSchema: unknown;
export declare const ThreadDtoSchema: unknown;
export declare const ThreadSchema: unknown;
export declare const MemoryDtoSchema: unknown;
export declare const MemorySchema: unknown;
export declare const MessageRoleSchema: unknown;
export declare const MessageUsageSchema: unknown;
export declare const GenerationEventSchema: unknown;
export declare const ErrorResponseDtoSchema: unknown;
export declare const ModelConfigurationSchema: unknown;
export declare const ModelGenerationInputSchema: unknown;

export declare const fromChatMessageDto: (input: unknown) => ChatMessage;
export declare const decodeErrorResponseDto: (input: unknown) => ErrorResponseDto;
export declare const toChatMessageDto: (input: ChatMessage) => ChatMessageDto;
export declare const fromConversationDto: (input: unknown) => Conversation;
export declare const toConversationDto: (input: Conversation) => ConversationDto;
export declare const fromThreadDto: (input: unknown) => Thread;
export declare const toThreadDto: (input: Thread) => ThreadDto;
export declare const fromMemoryDto: (input: unknown) => Memory;
export declare const toMemoryDto: (input: Memory) => MemoryDto;
export declare class ProtocolDecodeError extends Error {}

export interface ProtocolSchemas {
  readonly attachment: unknown;
  readonly toolCall: unknown;
  readonly toolResult: unknown;
  readonly extensionPart: unknown;
  readonly messagePart: unknown;
  readonly chatMessage: unknown;
  readonly chatMessageDto: unknown;
  readonly conversationDto: unknown;
  readonly threadDto: unknown;
  readonly memoryDto: unknown;
  readonly generationEvent: unknown;
  readonly errorResponseDto: unknown;
  readonly modelConfiguration: unknown;
}

export declare const protocolSchemas: ProtocolSchemas;
