import { Chat, type OpenAiCompatibleConfiguration } from "@emi/core/chat";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  safeValidateUIMessages,
  type SafeValidateUIMessagesResult,
  type StreamTextOnChunkCallback,
  type ToolSet,
  type UIMessage,
} from "ai";
import type { JSONSchema7 } from "json-schema";

interface ChatConfig extends OpenAiCompatibleConfiguration {}

export class AiSdkMessageValidationError extends Schema.TaggedErrorClass<AiSdkMessageValidationError>()(
  "AiSdkMessageValidationError",
  { message: Schema.String },
) {}

export interface ChatStreamRequest {
  messages: Array<Omit<UIMessage, "id">>;
  system?: string | undefined;
  tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
  config: ChatConfig;
  coachMode?: boolean | undefined;
  webSearch?: boolean | undefined;
  temporary?: boolean | undefined;
  sessionId?: string | undefined;
  threadId?: string | undefined;
  replaceMessageId?: string | undefined;
  requestId?: string | undefined;
}

type ChatStreamOptions = {
  request: ChatStreamRequest;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  onFinish?: Parameters<typeof Chat.stream.createChatStreamEffect>[0]["onFinish"];
  onChunk?: StreamTextOnChunkCallback<ToolSet>;
  onError?: (error: unknown) => void | Promise<void>;
};

const toCoreOptions = (options: ChatStreamOptions) => ({
  ...options,
  request: {
    messages: options.request.messages,
    system: options.request.system,
    tools: options.request.tools,
    configuration: options.request.config,
    webSearch: options.request.webSearch,
  },
});

export const validateUIMessagesEffect = <T extends UIMessage>(messages: unknown) =>
  Effect.tryPromise<SafeValidateUIMessagesResult<T>, AiSdkMessageValidationError>({
    try: () => safeValidateUIMessages<T>({ messages }),
    catch: (cause) =>
      new AiSdkMessageValidationError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });

export const validateStoredUIMessagesEffect = (messages: unknown[]) =>
  Effect.tryPromise({
    try: () => Chat.messages.validateStoredUIMessages(messages),
    catch: (cause) =>
      new AiSdkMessageValidationError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });

export const createChatStreamEffect = (options: ChatStreamOptions) =>
  Chat.stream.createChatStreamEffect(toCoreOptions(options));

export const createChatStream = (options: ChatStreamOptions) =>
  Effect.runPromise(createChatStreamEffect(options));
