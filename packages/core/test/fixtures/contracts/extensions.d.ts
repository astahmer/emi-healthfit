import type * as Effect from "effect/Effect";
import type * as Schema from "effect/Schema";

export interface ChatExtensionDefinition {
  readonly id: string;
  readonly namespace?: string;
  readonly parts?: Readonly<Record<string, Schema.ConstraintDecoder<unknown>>>;
  readonly tools?: Readonly<Record<string, Schema.ConstraintDecoder<unknown>>>;
  readonly navigation?: ReadonlyArray<Schema.Json>;
}

export interface ChatExtension extends ChatExtensionDefinition {
  readonly namespace: string;
}

export declare class ChatExtensions {
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
  }): Effect.Effect<Schema.Json, ChatExtensionError>;
  static runPromise<Value, Error>(effect: Effect.Effect<Value, Error>): Promise<Value>;
}

export declare class ChatExtensionError extends Error {
  readonly kind: "invalid-definition" | "collision" | "unknown-part";
}
