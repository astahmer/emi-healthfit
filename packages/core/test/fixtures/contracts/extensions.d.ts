export interface ChatExtensionDefinition {
  readonly id: string;
  readonly parts?: Record<string, unknown>;
  readonly tools?: Record<string, unknown>;
  readonly navigation?: ReadonlyArray<unknown>;
}

export interface ChatExtension extends ChatExtensionDefinition {
  readonly namespace: string;
}

export declare const defineChatExtension: (definition: ChatExtensionDefinition) => ChatExtension;

export declare const composeChatExtensions: (
  extensions: ReadonlyArray<ChatExtension>,
) => ReadonlyArray<ChatExtension>;
