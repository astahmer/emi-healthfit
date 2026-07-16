import * as Schema from "effect/Schema";

const MessageParts = Schema.Array(Schema.Unknown);
const Suggestions = Schema.Array(Schema.String);
const TextMessagePart = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String });

const parseJson = (value: string): unknown => JSON.parse(value);

export const decodeMessageParts = (value: string) =>
  Schema.decodeUnknownSync(MessageParts)(parseJson(value));

export const decodeSuggestions = (value: string) =>
  Schema.decodeUnknownSync(Suggestions)(parseJson(value));

export const textFromMessageParts = (parts: readonly unknown[]): string =>
  parts
    .filter(Schema.is(TextMessagePart))
    .map((part) => part.text)
    .join("\n");
