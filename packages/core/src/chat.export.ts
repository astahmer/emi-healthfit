import * as GenerationTerminalState from "./chat/generation-terminal-state.ts";
import * as MessageParts from "./chat/message-parts.ts";
import * as OpenAiChat from "./chat/openai.ts";
import * as OperationBudget from "./chat/operation-budget.ts";
import * as OrphanTurn from "./chat/orphan-turn.ts";
import * as ChatRequest from "./chat/request.ts";
import * as ChatSettings from "./chat/settings.ts";
import * as StreamResponse from "./chat/stream-response.ts";
import * as ToolCircuitBreaker from "./chat/tool-circuit-breaker.ts";
import * as UiMessages from "./chat/ui-messages.ts";
import type {
  OpenAiCompatibleConfiguration as OpenAiCompatibleConfigurationType,
  ChatStreamRequest as ChatStreamRequestType,
  GenerateTextConfiguration as GenerateTextConfigurationType,
} from "./chat/openai.ts";
import type {
  ChatOperationBudgetSnapshot as ChatOperationBudgetSnapshotType,
  ChatOperationCategory as ChatOperationCategoryType,
} from "./chat/operation-budget.ts";
import type { GenericChatSettings as GenericChatSettingsType } from "./chat/settings.ts";

export class Chat {
  private constructor() {}

  static readonly ChatMemoryRequestSchema = ChatRequest.ChatMemoryRequestSchema;
  static readonly ChatModelConfigurationSchema = ChatRequest.ChatModelConfigurationSchema;
  static readonly ChatStreamRequestSchema = ChatRequest.ChatStreamRequestSchema;
  static readonly CompactConversationRequestSchema = ChatRequest.CompactConversationRequestSchema;
  static readonly GenericChatSettingsSchema = ChatSettings.GenericChatSettingsSchema;
  static readonly defaultConversationTitlePrompt = OpenAiChat.defaultConversationTitlePrompt;
  static readonly defaultGenericChatSettings = ChatSettings.defaultGenericChatSettings;

  static readonly buildAssistantParts = MessageParts.buildAssistantParts;
  static readonly buildConversationTitlePrompt = OpenAiChat.buildConversationTitlePrompt;
  static readonly createChatOperationBudget = OperationBudget.createChatOperationBudget;
  static readonly createChatStreamResponse = StreamResponse.createChatStreamResponse;
  static readonly createToolCircuitBreaker = ToolCircuitBreaker.createToolCircuitBreaker;
  static readonly extractMemories = OpenAiChat.extractMemories;
  static readonly firstUserText = ChatRequest.firstUserText;
  static readonly generateConversationSummary = OpenAiChat.generateConversationSummary;
  static readonly generateConversationTitle = OpenAiChat.generateConversationTitle;
  static readonly generateMemorySummary = OpenAiChat.generateMemorySummary;
  static readonly generateSuggestions = OpenAiChat.generateSuggestions;
  static readonly getOrphanUserMessageId = OrphanTurn.getOrphanUserMessageId;
  static readonly getProviderMessages = OrphanTurn.getProviderMessages;
  static readonly isDuplicateOrphanRetry = OrphanTurn.isDuplicateOrphanRetry;
  static readonly normalizeGeneratedStrings = OpenAiChat.normalizeGeneratedStrings;
  static readonly resolveGenerationTerminalState = GenerationTerminalState.resolveGenerationTerminalState;
  static readonly toUiMessageStream = OpenAiChat.toUiMessageStream;
  static readonly validateChatAttachments = ChatRequest.validateChatAttachments;
  static readonly validateStoredUIMessages = UiMessages.validateStoredUIMessages;
}

export type OpenAiCompatibleConfiguration = OpenAiCompatibleConfigurationType;
export type ChatStreamRequest = ChatStreamRequestType;
export type GenerateTextConfiguration = GenerateTextConfigurationType;
export type ChatOperationBudgetSnapshot = ChatOperationBudgetSnapshotType;
export type ChatOperationCategory = ChatOperationCategoryType;
export type GenericChatSettings = GenericChatSettingsType;
