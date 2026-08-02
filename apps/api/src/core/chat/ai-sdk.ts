import {
  Chat,
  type OpenAiCompatibleConfiguration,
} from "@emi/core/chat";
import type { StreamTextOnChunkCallback, ToolSet, UIMessage } from "ai";
import type { JSONSchema7 } from "json-schema";

interface ChatConfig extends OpenAiCompatibleConfiguration {}

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

export const createChatStream = (options: {
  request: ChatStreamRequest;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  onFinish?: Parameters<typeof Chat.stream.createChatStream>[0]["onFinish"];
  onChunk?: StreamTextOnChunkCallback<ToolSet>;
  onError?: (error: unknown) => void | Promise<void>;
}) =>
  Chat.stream.createChatStream({
    ...options,
    request: {
      messages: options.request.messages,
      system: options.request.system,
      tools: options.request.tools,
      configuration: options.request.config,
      webSearch: options.request.webSearch,
    },
  });
