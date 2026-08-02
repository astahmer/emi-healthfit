export declare class Chat {
  static readonly schemas: {
    readonly chatMemoryRequest: unknown;
    readonly chatModelConfiguration: unknown;
    readonly chatStreamRequest: unknown;
    readonly compactConversationRequest: unknown;
    readonly genericChatSettings: unknown;
  };
  static readonly settings: { readonly defaultGenericChatSettings: unknown };
  static readonly prompts: {
    readonly defaultConversationTitlePrompt: string;
    readonly buildConversationTitlePrompt: unknown;
  };
  static readonly stream: {
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
    readonly extractMemories: (...args: ReadonlyArray<never>) => unknown;
    readonly generateMemorySummary: (...args: ReadonlyArray<never>) => unknown;
  };
  static readonly generation: {
    readonly generateConversationSummary: (...args: ReadonlyArray<never>) => unknown;
    readonly generateConversationTitle: (...args: ReadonlyArray<never>) => unknown;
    readonly generateSuggestions: (...args: ReadonlyArray<never>) => unknown;
    readonly normalizeGeneratedStrings: (...args: ReadonlyArray<never>) => unknown;
    readonly resolveGenerationTerminalState: (...args: ReadonlyArray<never>) => unknown;
  };
  static readonly messages: {
    readonly buildAssistantParts: (...args: ReadonlyArray<never>) => unknown;
    readonly firstUserText: (...args: ReadonlyArray<never>) => unknown;
    readonly getProviderMessages: (...args: ReadonlyArray<never>) => unknown;
    readonly validateStoredUIMessages: (...args: ReadonlyArray<never>) => unknown;
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
