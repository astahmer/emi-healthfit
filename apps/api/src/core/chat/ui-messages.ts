import { safeValidateUIMessages, type UIMessage } from "ai";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const LegacyToolErrorPart = Schema.Struct({
  type: Schema.Literal("dynamic-tool"),
  toolName: Schema.String,
  toolCallId: Schema.String,
  state: Schema.Literal("output-error"),
  input: Schema.optional(Schema.Unknown),
  output: Schema.optional(Schema.Unknown),
  errorText: Schema.optional(Schema.String),
});

const ErrorTextOutput = Schema.Struct({ type: Schema.Literal("error-text"), value: Schema.String });

const decodeLegacyToolErrorPart = Schema.decodeUnknownOption(LegacyToolErrorPart);
const decodeErrorTextOutput = Schema.decodeUnknownOption(ErrorTextOutput);

const normalizeLegacyToolErrorPart = (part: unknown): unknown => {
  const decoded = decodeLegacyToolErrorPart(part);
  if (Option.isNone(decoded)) return part;
  const output = decodeErrorTextOutput(decoded.value.output);
  const errorText =
    decoded.value.errorText ??
    (Option.isSome(output) ? output.value.value : "Tool execution failed.");
  return {
    type: "dynamic-tool",
    toolName: decoded.value.toolName,
    toolCallId: decoded.value.toolCallId,
    ...(decoded.value.input === undefined ? {} : { input: decoded.value.input }),
    errorText,
    state: "output-error",
  };
};

const normalizeLegacyToolErrors = (messages: unknown[]): unknown[] =>
  messages.map((message) => {
    if (message === null || typeof message !== "object" || !("parts" in message)) return message;
    const parts = message.parts;
    if (!Array.isArray(parts)) return message;
    return { ...message, parts: parts.map(normalizeLegacyToolErrorPart) };
  });

export const validateStoredUIMessages = async (messages: unknown[]): Promise<UIMessage[]> => {
  if (messages.length === 0) return [];

  const validatedMessages = await safeValidateUIMessages<UIMessage>({
    messages: normalizeLegacyToolErrors(messages),
  });
  if (!validatedMessages.success) throw validatedMessages.error;
  if (validatedMessages.data.some((message) => message.id.trim() === "")) {
    throw new Error("UI messages require non-empty identifiers");
  }
  return validatedMessages.data;
};
