import {
  createChatStream as createCoreChatStream,
  extractMemories as extractCoreMemories,
  generateConversationSummary,
  generateConversationTitle,
  generateMemorySummary as generateCoreMemorySummary,
  generateSuggestions as generateCoreSuggestions,
  normalizeGeneratedStrings,
  toUiMessageStream,
  type GenerateTextConfiguration,
  type OpenAiCompatibleConfiguration,
} from "@emi/core/chat";
import type { StreamTextOnChunkCallback, ToolSet, UIMessage } from "ai";
import type { JSONSchema7 } from "json-schema";

export { normalizeGeneratedStrings, toUiMessageStream };

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

const configurationOf = ({
  apiKey,
  baseUrl,
  model,
}: GenerateTextConfiguration): GenerateTextConfiguration => ({ apiKey, baseUrl, model });

export const createChatStream = (options: {
  request: ChatStreamRequest;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  onFinish?: Parameters<typeof createCoreChatStream>[0]["onFinish"];
  onChunk?: StreamTextOnChunkCallback<ToolSet>;
  onError?: (error: unknown) => void | Promise<void>;
}) =>
  createCoreChatStream({
    ...options,
    request: {
      messages: options.request.messages,
      system: options.request.system,
      tools: options.request.tools,
      configuration: options.request.config,
      webSearch: options.request.webSearch,
    },
  });

export const generateSuggestions = (request: {
  apiKey: string;
  baseUrl?: string | undefined;
  model: string;
  lastAssistantText: string;
  lastUserText?: string | undefined;
}) =>
  generateCoreSuggestions({
    configuration: configurationOf(request),
    lastAssistantText: request.lastAssistantText,
    lastUserText: request.lastUserText,
  });

export const generateThreadTitle = (
  apiKey: string,
  baseUrl: string | undefined,
  firstUserMessage: string,
) =>
  generateConversationTitle({
    configuration: { apiKey, baseUrl, model: "gpt-4o-mini" },
    firstUserMessage,
  });

export const generateThreadSummary = (
  apiKey: string,
  baseUrl: string | undefined,
  model: string,
  messages: Array<{ role: string; text: string }>,
) => generateConversationSummary({ configuration: { apiKey, baseUrl, model }, messages });

export const generateMemorySummary = (
  apiKey: string,
  baseUrl: string | undefined,
  model: string,
  memories: string[],
) => generateCoreMemorySummary({ configuration: { apiKey, baseUrl, model }, memories });

export const extractMemories = (
  apiKey: string,
  baseUrl: string | undefined,
  model: string,
  text: string,
  existingMemories: string[],
) => extractCoreMemories({ configuration: { apiKey, baseUrl, model }, text, existingMemories });
