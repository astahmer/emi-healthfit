import type * as Effect from "effect/Effect";
import type * as Schema from "effect/Schema";

export interface ChatExtensionDefinition {
  readonly id: string;
  readonly namespace?: string;
  readonly parts?: Record<string, Schema.ConstraintDecoder<unknown>>;
  readonly tools?: Record<string, unknown>;
  readonly navigation?: ReadonlyArray<unknown>;
}

export interface ChatExtension extends ChatExtensionDefinition {
  readonly namespace: string;
}

export declare class ChatExtensions {
  private constructor();
  static define(
    definition: ChatExtensionDefinition,
  ): Effect.Effect<ChatExtension, ChatExtensionError>;
  static compose(
    extensions: ReadonlyArray<ChatExtension>,
  ): Effect.Effect<ReadonlyArray<ChatExtension>, ChatExtensionError>;
  static decodePart(input: {
    readonly extension: ChatExtension;
    readonly name: string;
    readonly value: unknown;
  }): Effect.Effect<unknown, ChatExtensionError>;
  static runPromise<Value, Error>(effect: Effect.Effect<Value, Error>): Promise<Value>;
}

export declare class ChatExtensionError extends Error {
  readonly kind: "invalid-definition" | "collision" | "unknown-part";
}
