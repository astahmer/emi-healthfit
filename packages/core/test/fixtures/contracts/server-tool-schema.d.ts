import type * as Schema from "effect/Schema";

export declare class ToolSchema {
  static optional<S extends Schema.Constraint>(
    schema: S,
  ): Schema.Schema<Schema.Schema.Type<S> | undefined, Schema.Schema.Encoded<S> | null | undefined>;
}
