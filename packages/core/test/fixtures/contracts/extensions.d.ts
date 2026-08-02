export interface ChatExtensionDefinition {
  readonly id: string;
  readonly parts?: Record<string, unknown>;
  readonly tools?: Record<string, unknown>;
  readonly navigation?: ReadonlyArray<unknown>;
}

export interface ChatExtension extends ChatExtensionDefinition {
  readonly namespace: string;
}

export declare class ChatExtensions {
  private constructor();
  static define(definition: ChatExtensionDefinition): ChatExtension;
  static compose(extensions: ReadonlyArray<ChatExtension>): ReadonlyArray<ChatExtension>;
}
