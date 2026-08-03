export declare class Chat {
  static readonly app: { readonly defaultConfig: unknown };
  static readonly schemas: {
    readonly appConfig: unknown;
    readonly chatMemoryRequest: unknown;
    readonly chatModelConfiguration: unknown;
    readonly chatStreamRequest: unknown;
    readonly compactConversationRequest: unknown;
    readonly genericChatSettings: unknown;
    readonly release: unknown;
    readonly releaseHistory: unknown;
    readonly settingsDescriptor: unknown;
  };
  static readonly settings: { readonly defaultGenericChatSettings: unknown };
  static readonly prompts: {
    readonly defaultConversationTitlePrompt: string;
    readonly buildConversationTitlePrompt: unknown;
  };
  static readonly stream: {
    readonly createChatStreamEffect: (...args: ReadonlyArray<never>) => unknown;
    readonly createChatStream: (...args: ReadonlyArray<never>) => unknown;
    readonly createChatStreamResponse: (...args: ReadonlyArray<never>) => unknown;
    readonly toUiMessageStream: (...args: ReadonlyArray<never>) => unknown;
  };
  static readonly operations: {
    readonly createChatOperationBudget: (...args: ReadonlyArray<never>) => unknown;
  };
  static readonly tools: {
    readonly createToolCircuitBreaker: (...args: ReadonlyArray<never>) => unknown;
  };
  static readonly memory: {
    readonly extractMemoriesEffect: (...args: ReadonlyArray<never>) => unknown;
    readonly extractMemories: (...args: ReadonlyArray<never>) => unknown;
    readonly generateMemorySummaryEffect: (...args: ReadonlyArray<never>) => unknown;
    readonly generateMemorySummary: (...args: ReadonlyArray<never>) => unknown;
  };
  static readonly generation: {
    readonly generateConversationSummaryEffect: (...args: ReadonlyArray<never>) => unknown;
    readonly generateConversationSummary: (...args: ReadonlyArray<never>) => unknown;
    readonly generateConversationTitleEffect: (...args: ReadonlyArray<never>) => unknown;
    readonly generateConversationTitle: (...args: ReadonlyArray<never>) => unknown;
    readonly generateSuggestionsEffect: (...args: ReadonlyArray<never>) => unknown;
    readonly generateSuggestions: (...args: ReadonlyArray<never>) => unknown;
    readonly normalizeGeneratedStrings: (...args: ReadonlyArray<never>) => unknown;
    readonly resolveGenerationTerminalState: (...args: ReadonlyArray<never>) => unknown;
  };
  static readonly messages: {
    readonly buildAssistantPartsEffect: (...args: ReadonlyArray<never>) => unknown;
    readonly buildAssistantParts: (...args: ReadonlyArray<never>) => Promise<unknown>;
    readonly firstUserText: (...args: ReadonlyArray<never>) => unknown;
    readonly getProviderMessages: (...args: ReadonlyArray<never>) => unknown;
    readonly validateUIMessagesEffect: (...args: ReadonlyArray<never>) => unknown;
    readonly validateStoredUIMessagesEffect: (...args: ReadonlyArray<never>) => unknown;
    readonly validateStoredUIMessages: (...args: ReadonlyArray<never>) => unknown;
    readonly toProtocolParts: (...args: ReadonlyArray<never>) => unknown;
    readonly toProtocolPartsEffect: (...args: ReadonlyArray<never>) => unknown;
    readonly fromProtocolMessage: (...args: ReadonlyArray<never>) => unknown;
  };
  static readonly orphans: {
    readonly getOrphanUserMessageId: (...args: ReadonlyArray<never>) => unknown;
    readonly isDuplicateOrphanRetry: (...args: ReadonlyArray<never>) => unknown;
  };
  static readonly attachments: {
    readonly validateChatAttachments: (...args: ReadonlyArray<never>) => unknown;
  };
}

export type OpenAiCompatibleConfiguration = unknown;
export type ChatStreamRequest = unknown;
export type ChatStreamOptions = unknown;
export type ChatStreamPart = unknown;
export type GenerateTextConfiguration = unknown;
export type ChatOperationBudgetSnapshot = unknown;
export type ChatOperationCategory = string;
export type GenericChatSettings = unknown;
