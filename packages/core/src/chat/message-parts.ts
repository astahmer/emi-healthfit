import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const ToolOutput = Schema.Struct({
  type: Schema.Literals(["json", "text"]),
  value: Schema.Unknown,
});

const ErrorOutput = Schema.Union([
  Schema.Struct({ type: Schema.Literal("error-text") }),
  Schema.Struct({ error: Schema.String }),
]);

const ProviderPart = Schema.Struct({
  type: Schema.String,
  toolCallId: Schema.optional(Schema.String),
  toolName: Schema.optional(Schema.String),
  input: Schema.optional(Schema.Unknown),
  output: Schema.optional(Schema.Unknown),
  text: Schema.optional(Schema.String),
});

const ProviderMessage = Schema.Struct({
  role: Schema.String,
  content: Schema.optional(Schema.Unknown),
});

const decodeProviderPart = Schema.decodeUnknownOption(ProviderPart);
const decodeProviderMessage = Schema.decodeUnknownOption(ProviderMessage);
const decodeToolOutput = Schema.decodeUnknownOption(ToolOutput);
const decodeErrorOutput = Schema.decodeUnknownOption(ErrorOutput);

const normalizeToolOutput = (output: unknown): unknown => {
  const decoded = decodeToolOutput(output);
  return Option.isSome(decoded) ? decoded.value.value : output;
};

const isErrorOutput = (output: unknown): boolean => Option.isSome(decodeErrorOutput(output));

const errorTextFrom = (output: unknown): string => {
  if (output instanceof Error) return output.message;
  if (typeof output === "string") return output;
  const decoded = decodeErrorOutput(output);
  if (
    Option.isSome(decoded) &&
    typeof output === "object" &&
    output !== null &&
    "value" in output
  ) {
    return typeof output.value === "string" ? output.value : "Tool execution failed.";
  }
  return "Tool execution failed.";
};

const messageParts = (content: unknown): (typeof ProviderPart.Type)[] => {
  if (content === undefined || content === null) return [];
  const candidates = Array.isArray(content) ? content : [content];
  return candidates.flatMap((candidate) => {
    const decoded = decodeProviderPart(candidate);
    return Option.isSome(decoded) ? [decoded.value] : [];
  });
};

export const buildAssistantParts = (messages: unknown[]): unknown[] => {
  const assistantParts: unknown[] = [];
  const toolCalls = new Map<string, { toolName: string; input: unknown }>();
  const toolResults = new Map<string, { output: unknown; outcome: "success" | "error" }>();
  const emittedToolCalls = new Set<string>();

  for (const candidate of messages) {
    const decoded = decodeProviderMessage(candidate);
    if (Option.isNone(decoded)) continue;
    const message = decoded.value;
    for (const part of messageParts(message.content)) {
      if (
        message.role === "assistant" &&
        part.type === "tool-call" &&
        part.toolCallId !== undefined
      ) {
        toolCalls.set(part.toolCallId, {
          toolName: part.toolName ?? "",
          input: part.input,
        });
      } else if (
        message.role === "tool" &&
        part.type === "tool-result" &&
        part.toolCallId !== undefined
      ) {
        const rawOutput = part.output;
        toolResults.set(part.toolCallId, {
          output: normalizeToolOutput(rawOutput),
          outcome: isErrorOutput(rawOutput) ? "error" : "success",
        });
      }
    }
  }

  for (const candidate of messages) {
    const decoded = decodeProviderMessage(candidate);
    if (Option.isNone(decoded) || decoded.value.role !== "assistant") continue;
    for (const part of messageParts(decoded.value.content)) {
      if (part.type === "text") {
        if (part.text !== undefined && part.text !== "") {
          assistantParts.push({ type: "text", text: part.text });
        }
      } else if (part.type === "tool-call" && part.toolCallId !== undefined) {
        if (emittedToolCalls.has(part.toolCallId)) continue;
        const call = toolCalls.get(part.toolCallId);
        if (call === undefined) continue;
        const result = toolResults.get(part.toolCallId);
        emittedToolCalls.add(part.toolCallId);
        if (result?.outcome === "success") {
          assistantParts.push({
            type: "dynamic-tool",
            toolName: call.toolName,
            toolCallId: part.toolCallId,
            input: call.input,
            output: result.output,
            state: "output-available",
          });
          continue;
        }
        assistantParts.push({
          type: "dynamic-tool",
          toolName: call.toolName,
          toolCallId: part.toolCallId,
          input: call.input,
          errorText: errorTextFrom(result?.output),
          state: "output-error",
        });
      }
    }
  }

  return assistantParts;
};
