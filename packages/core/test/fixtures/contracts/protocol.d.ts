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
  readonly output: unknown;
  readonly isError?: boolean;
}

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
}

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
}

export interface ProtocolSchemas {
  readonly chatMessage: unknown;
  readonly messagePart: unknown;
  readonly generationEvent: unknown;
}

export declare const protocolSchemas: ProtocolSchemas;
