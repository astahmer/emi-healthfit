import * as Schema from "effect/Schema";
import { MessagePartSchema, type MessagePart } from "@emi/core/protocol";
import { decodeJson } from "../lib/json-codec.ts";

const MessageParts = Schema.Array(MessagePartSchema);
const Suggestions = Schema.Array(Schema.String);
const TextMessagePart = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String });
export const decodeMessageParts = (value: string) =>
  Schema.decodeUnknownSync(MessageParts)(decodeJson(value));

export const decodeSuggestions = (value: string) =>
  Schema.decodeUnknownSync(Suggestions)(decodeJson(value));

export const textFromMessageParts = (parts: readonly MessagePart[]): string =>
  parts
    .filter(Schema.is(TextMessagePart))
    .map((part) => part.text)
    .join("\n");
