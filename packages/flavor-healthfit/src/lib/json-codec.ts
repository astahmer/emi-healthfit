import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

const Json = Schema.String.pipe(
  Schema.decodeTo(Schema.Unknown, SchemaTransformation.fromJsonString),
);

export const decodeJson = Schema.decodeUnknownSync(Json);
export const decodeJsonOption = Schema.decodeUnknownOption(Json);
