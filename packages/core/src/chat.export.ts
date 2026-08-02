import * as GenerationTerminalState from "./chat/generation-terminal-state.ts";
import * as MessageParts from "./chat/message-parts.ts";
import {
  OpenAiChat,
  type OpenAiCompatibleConfiguration as OpenAiCompatibleConfigurationType,
  type ChatStreamRequest as ChatStreamRequestType,
  type ChatStreamOptions as ChatStreamOptionsType,
  type ChatStreamPart as ChatStreamPartType,
  type GenerateTextConfiguration as GenerateTextConfigurationType,
} from "./adapters/ai-sdk/openai-chat.ts";
import * as OperationBudget from "./chat/operation-budget.ts";
import * as OrphanTurn from "./chat/orphan-turn.ts";
import * as ChatRequest from "./chat/request.ts";
import * as ChatSettings from "./chat/settings.ts";
import * as StreamResponse from "./chat/stream-response.ts";
import * as ToolCircuitBreaker from "./chat/tool-circuit-breaker.ts";
import * as UiMessages from "./chat/ui-messages.ts";
import type {
  ChatOperationBudgetSnapshot as ChatOperationBudgetSnapshotType,
  ChatOperationCategory as ChatOperationCategoryType,
} from "./chat/operation-budget.ts";
import type { GenericChatSettings as GenericChatSettingsType } from "./chat/settings.ts";

export class Chat {
  static readonly schemas = {
    chatMemoryRequest: ChatRequest.ChatMemoryRequestSchema,
    chatModelConfiguration: ChatRequest.ChatModelConfigurationSchema,
    chatStreamRequest: ChatRequest.ChatStreamRequestSchema,
    compactConversationRequest: ChatRequest.CompactConversationRequestSchema,
    genericChatSettings: ChatSettings.GenericChatSettingsSchema,
    openAiCompatibleConfiguration: OpenAiChat.configurationSchema,
  } as const;

  static readonly settings = {
    defaultGenericChatSettings: ChatSettings.defaultGenericChatSettings,
  } as const;

  static readonly prompts = {
    defaultConversationTitlePrompt: OpenAiChat.defaultConversationTitlePrompt,
    buildConversationTitlePrompt: OpenAiChat.buildConversationTitlePrompt,
  } as const;

  static readonly stream = {
    createChatStream: OpenAiChat.createChatStream,
    createChatStreamResponse: StreamResponse.createChatStreamResponse,
    toUiMessageStream: OpenAiChat.toUiMessageStream,
  } as const;

  static readonly operations = {
    createChatOperationBudget: OperationBudget.createChatOperationBudget,
  } as const;

  static readonly tools = {
    createToolCircuitBreaker: ToolCircuitBreaker.createToolCircuitBreaker,
  } as const;

  static readonly memory = {
    extractMemories: OpenAiChat.extractMemories,
    generateMemorySummary: OpenAiChat.generateMemorySummary,
  } as const;

  static readonly generation = {
    generateConversationSummary: OpenAiChat.generateConversationSummary,
    generateConversationTitle: OpenAiChat.generateConversationTitle,
    generateSuggestions: OpenAiChat.generateSuggestions,
    normalizeGeneratedStrings: OpenAiChat.normalizeGeneratedStrings,
    resolveGenerationTerminalState: GenerationTerminalState.resolveGenerationTerminalState,
  } as const;

  static readonly messages = {
    buildAssistantParts: MessageParts.buildAssistantParts,
    firstUserText: ChatRequest.firstUserText,
    getProviderMessages: OrphanTurn.getProviderMessages,
    validateStoredUIMessages: UiMessages.validateStoredUIMessages,
  } as const;

  static readonly orphans = {
    getOrphanUserMessageId: OrphanTurn.getOrphanUserMessageId,
    isDuplicateOrphanRetry: OrphanTurn.isDuplicateOrphanRetry,
  } as const;

  static readonly attachments = {
    validateChatAttachments: ChatRequest.validateChatAttachments,
  } as const;
}

export type OpenAiCompatibleConfiguration = OpenAiCompatibleConfigurationType;
export type ChatStreamRequest = ChatStreamRequestType;
export type ChatStreamOptions = ChatStreamOptionsType;
export type ChatStreamPart = ChatStreamPartType;
export type GenerateTextConfiguration = GenerateTextConfigurationType;
export type ChatOperationBudgetSnapshot = ChatOperationBudgetSnapshotType;
export type ChatOperationCategory = ChatOperationCategoryType;
export type GenericChatSettings = GenericChatSettingsType;
