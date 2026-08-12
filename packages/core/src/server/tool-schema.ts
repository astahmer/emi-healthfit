import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

export class ToolSchema {
  /** Model providers commonly emit explicit null for omitted optional tool arguments. */
  static optional<S extends Schema.Constraint>(schema: S) {
    return Schema.optionalKey(
      Schema.NullOr(schema).pipe(
        Schema.decodeTo(Schema.UndefinedOr(schema), {
          decode: SchemaGetter.transform((value) => (value === null ? undefined : value)),
          encode: SchemaGetter.transform((value) => (value === undefined ? null : value)),
        }),
      ),
    );
  }
}
