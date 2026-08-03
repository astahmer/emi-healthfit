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
  readonly input: { readonly [key: string]: JsonValue };
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

export interface DynamicComponentElement {
  readonly type: string;
  readonly props: JsonValueRecord;
  readonly children?: ReadonlyArray<string>;
  readonly visible?: boolean;
}

export interface DynamicComponentSpec {
  readonly root: string;
  readonly elements: Readonly<Record<string, DynamicComponentElement>>;
}

export interface DynamicComponentEnvelope {
  readonly spec: DynamicComponentSpec;
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };
export type JsonValueRecord = { readonly [key: string]: JsonValue };

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
  | { readonly type: "tool-result"; readonly result: ToolResult }
  | {
      readonly type: "tool-invocation";
      readonly toolName: string;
      readonly toolCallId: string;
      readonly state: "input-available" | "output-available" | "output-error";
      readonly input: JsonValue;
      readonly output?: JsonValue;
      readonly errorText?: string;
    };

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
  readonly generate: (
    input: ModelGenerationInput,
  ) => Stream.Stream<GenerationEvent, ModelProviderError>;
}

export type ModelProviderError = TransportError;

import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";

export declare class ProtocolDecodeError extends Error {}

export interface ProtocolSchemas {
  readonly attachment: unknown;
  readonly dynamicComponentElement: unknown;
  readonly dynamicComponentEnvelope: unknown;
  readonly dynamicComponentSpec: unknown;
  readonly attachmentId: unknown;
  readonly conversationId: unknown;
  readonly generationId: unknown;
  readonly memoryId: unknown;
  readonly messageId: unknown;
  readonly threadId: unknown;
  readonly timestamp: unknown;
  readonly toolCallId: unknown;
  readonly toolCall: unknown;
  readonly toolResult: unknown;
  readonly extensionPart: unknown;
  readonly messagePart: unknown;
  readonly chatMessage: unknown;
  readonly chatMessageDto: unknown;
  readonly conversation: unknown;
  readonly conversationDto: unknown;
  readonly thread: unknown;
  readonly threadDto: unknown;
  readonly memory: unknown;
  readonly memoryDto: unknown;
  readonly messageRole: unknown;
  readonly messageUsage: unknown;
  readonly generationEvent: unknown;
  readonly errorResponseDto: unknown;
  readonly modelConfiguration: unknown;
  readonly modelGenerationInput: unknown;
  readonly transportError: unknown;
  readonly modelProviderError: unknown;
}

export declare class ChatProtocol {
  static readonly schemas: ProtocolSchemas;
  static fromChatMessageDto(input: unknown): Effect.Effect<ChatMessage, ProtocolDecodeError>;
  static toChatMessageDto(input: ChatMessage): Effect.Effect<ChatMessageDto, ProtocolDecodeError>;
  static fromConversationDto(input: unknown): Effect.Effect<Conversation, ProtocolDecodeError>;
  static toConversationDto(
    input: Conversation,
  ): Effect.Effect<ConversationDto, ProtocolDecodeError>;
  static fromThreadDto(input: unknown): Effect.Effect<Thread, ProtocolDecodeError>;
  static toThreadDto(input: Thread): Effect.Effect<ThreadDto, ProtocolDecodeError>;
  static fromMemoryDto(input: unknown): Effect.Effect<Memory, ProtocolDecodeError>;
  static toMemoryDto(input: Memory): Effect.Effect<MemoryDto, ProtocolDecodeError>;
  static decodeErrorResponseDto(
    input: unknown,
  ): Effect.Effect<ErrorResponseDto, ProtocolDecodeError>;
  static decodeModelProviderError(
    input: unknown,
  ): Effect.Effect<ModelProviderError, ProtocolDecodeError>;
  static runPromise<Value, Error>(effect: Effect.Effect<Value, Error>): Promise<Value>;
}
