import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import { ChatProtocol, type MessagePart } from "@emi/core/protocol";
import { decodeJson } from "../../platform/json-codec.ts";

const MessageParts = Schema.Array(Schema.Unknown);
const Suggestions = Schema.Array(Schema.String);
const TextMessagePart = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String });

const DynamicToolPart = Schema.Struct({
  type: Schema.Literal("dynamic-tool"),
  toolName: Schema.String,
  toolCallId: Schema.String,
  state: Schema.Literals([
    "input-streaming",
    "input-available",
    "output-available",
    "output-error",
    "output-denied",
  ]),
  input: Schema.optional(Schema.Json),
  output: Schema.optional(Schema.Json),
  errorText: Schema.optional(Schema.String),
});

const toProtocolMessagePart = (value: unknown): MessagePart => {
  const canonical = Schema.decodeUnknownOption(ChatProtocol.schemas.messagePart)(value);
  if (Option.isSome(canonical)) return canonical.value;

  const dynamicTool = Schema.decodeUnknownSync(DynamicToolPart)(value);
  const input = dynamicTool.input ?? {};
  if (dynamicTool.state === "input-streaming" || dynamicTool.state === "input-available") {
    return {
      type: "tool-invocation",
      toolName: dynamicTool.toolName,
      toolCallId: dynamicTool.toolCallId,
      state: "input-available",
      input,
    };
  }
  if (dynamicTool.state === "output-available") {
    return {
      type: "tool-invocation",
      toolName: dynamicTool.toolName,
      toolCallId: dynamicTool.toolCallId,
      state: "output-available",
      input,
      ...(dynamicTool.output === undefined ? {} : { output: dynamicTool.output }),
    };
  }
  return {
    type: "tool-invocation",
    toolName: dynamicTool.toolName,
    toolCallId: dynamicTool.toolCallId,
    state: "output-error",
    input,
    errorText:
      dynamicTool.errorText ??
      (dynamicTool.state === "output-denied"
        ? "Tool invocation denied."
        : "Tool invocation failed."),
  };
};

export const decodeMessageParts = (value: string) =>
  Schema.decodeUnknownSync(MessageParts)(decodeJson(value)).map(toProtocolMessagePart);

export const decodeSuggestions = (value: string) =>
  Schema.decodeUnknownSync(Suggestions)(decodeJson(value));

export const textFromMessageParts = (parts: readonly MessagePart[]): string =>
  parts
    .filter(Schema.is(TextMessagePart))
    .map((part) => part.text)
    .join("\n");
