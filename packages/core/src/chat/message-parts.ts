import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { UIMessageChunk } from "ai";
import type { MessagePart } from "../protocol/parts.ts";
import { MessagePartSchema } from "../protocol/parts.ts";

const ToolOutput = Schema.Struct({
  type: Schema.Literals(["json", "text"]),
  value: Schema.Json,
});

const ErrorOutput = Schema.Union([
  Schema.Struct({ type: Schema.Literal("error-text") }),
  Schema.Struct({ error: Schema.String }),
]);

const ProviderPart = Schema.Struct({
  type: Schema.String,
  toolCallId: Schema.optional(Schema.String),
  toolName: Schema.optional(Schema.String),
  input: Schema.optional(Schema.Json),
  output: Schema.optional(Schema.Json),
  text: Schema.optional(Schema.String),
});

const ProviderMessage = Schema.Struct({
  role: Schema.String,
  content: Schema.optional(Schema.Json),
});

const JsonString = Schema.fromJsonString(Schema.Json);

const decodeJson = (value: unknown) => {
  const serialized = JSON.stringify(value);
  return serialized === undefined
    ? Option.none()
    : Schema.decodeUnknownOption(JsonString)(serialized);
};

const decodeProviderPart = (value: unknown) => {
  const json = decodeJson(value);
  return Option.isNone(json) ? Option.none() : Schema.decodeUnknownOption(ProviderPart)(json.value);
};

const decodeProviderMessage = (value: unknown) => {
  const json = decodeJson(value);
  return Option.isNone(json)
    ? Option.none()
    : Schema.decodeUnknownOption(ProviderMessage)(json.value);
};

const decodeToolOutput = (value: unknown) => {
  const json = decodeJson(value);
  return Option.isNone(json) ? Option.none() : Schema.decodeUnknownOption(ToolOutput)(json.value);
};

const decodeErrorOutput = (value: unknown) => {
  const json = decodeJson(value);
  return Option.isNone(json) ? Option.none() : Schema.decodeUnknownOption(ErrorOutput)(json.value);
};

const normalizeToolOutput = (output: unknown): Schema.Json => {
  const decoded = decodeToolOutput(output);
  if (Option.isSome(decoded)) return decoded.value.value;
  const json = decodeJson(output);
  return Option.isSome(json) ? json.value : null;
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

export class ChatMessagePartsError extends Schema.TaggedErrorClass<ChatMessagePartsError>()(
  "ChatMessagePartsError",
  { message: Schema.String },
) {}

export class ChatMessageParts {
  static readonly buildAssistantPartsFromUiChunks: (
    chunks: ReadonlyArray<UIMessageChunk>,
  ) => ReadonlyArray<MessagePart> = (chunks) => {
    interface PendingTool {
      toolName: string;
      input: Schema.Json;
      output?: Schema.Json;
      errorText?: string;
      flushed: boolean;
    }

    const parts: MessagePart[] = [];
    const textBuffers = new Map<string, string[]>();
    const pendingTools = new Map<string, PendingTool>();
    const order: Array<{ kind: "text" | "tool"; id: string }> = [];

    const flushText = (id: string) => {
      const buffer = textBuffers.get(id);
      if (buffer === undefined) return;
      const text = buffer.join("");
      if (text.trim() !== "") parts.push({ type: "text", text });
      textBuffers.delete(id);
    };

    const flushTool = (
      toolCallId: string,
      state: "output-available" | "output-error",
      outcome?: { output?: Schema.Json; errorText?: string },
    ) => {
      const tool = pendingTools.get(toolCallId);
      if (tool === undefined || tool.flushed) return;
      tool.flushed = true;
      parts.push({
        type: "tool-invocation",
        toolName: tool.toolName,
        toolCallId,
        state,
        input: tool.input,
        ...(state === "output-available" ? { output: outcome?.output ?? tool.output ?? null } : {}),
        ...(state === "output-error" && (outcome?.errorText ?? tool.errorText) !== undefined
          ? { errorText: outcome?.errorText ?? tool.errorText }
          : {}),
      });
    };

    for (const chunk of chunks) {
      switch (chunk.type) {
        case "text-start":
          textBuffers.set(chunk.id, []);
          order.push({ kind: "text", id: chunk.id });
          break;
        case "text-delta": {
          const buffer = textBuffers.get(chunk.id);
          if (buffer !== undefined) buffer.push(chunk.delta);
          break;
        }
        case "text-end":
          flushText(chunk.id);
          break;
        case "tool-input-available":
        case "tool-input-start": {
          if (!pendingTools.has(chunk.toolCallId)) {
            pendingTools.set(chunk.toolCallId, {
              toolName: chunk.toolName,
              input: (chunk.type === "tool-input-available" ? chunk.input : {}) as Schema.Json,
              flushed: false,
            });
            order.push({ kind: "tool", id: chunk.toolCallId });
          }
          break;
        }
        case "tool-input-error": {
          const existing = pendingTools.get(chunk.toolCallId);
          if (existing !== undefined) {
            existing.toolName = chunk.toolName;
            existing.input = chunk.input as Schema.Json;
            existing.errorText = chunk.errorText;
          } else {
            pendingTools.set(chunk.toolCallId, {
              toolName: chunk.toolName,
              input: chunk.input as Schema.Json,
              errorText: chunk.errorText,
              flushed: false,
            });
            order.push({ kind: "tool", id: chunk.toolCallId });
          }
          break;
        }
        case "tool-output-available": {
          const tool = pendingTools.get(chunk.toolCallId);
          if (tool !== undefined) tool.output = chunk.output as Schema.Json;
          flushTool(chunk.toolCallId, "output-available");
          break;
        }
        case "tool-output-error": {
          const tool = pendingTools.get(chunk.toolCallId);
          if (tool !== undefined) tool.errorText = chunk.errorText;
          flushTool(chunk.toolCallId, "output-error");
          break;
        }
        default:
          break;
      }
    }

    for (const { kind, id } of order) {
      if (kind === "tool") {
        const tool = pendingTools.get(id);
        if (tool !== undefined && !tool.flushed) {
          flushTool(id, tool.errorText !== undefined ? "output-error" : "output-available");
        }
      } else {
        flushText(id);
      }
    }

    return parts;
  };

  static readonly buildAssistantPartsEffect: (
    messages: ReadonlyArray<unknown>,
  ) => Effect.Effect<ReadonlyArray<MessagePart>, ChatMessagePartsError> = Effect.fn(
    "chat.messageParts.buildAssistantParts",
  )(function* (messages: ReadonlyArray<unknown>) {
    const assistantParts: Schema.Json[] = [];
    const toolCalls = new Map<string, { toolName: string; input: Schema.Json }>();
    const toolResults = new Map<string, { output: Schema.Json; outcome: "success" | "error" }>();
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
            input: part.input ?? {},
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
              type: "tool-invocation",
              toolName: call.toolName,
              toolCallId: part.toolCallId,
              input: call.input,
              state: "output-available",
              output: result.output,
            });
            continue;
          }
          assistantParts.push({
            type: "tool-invocation",
            toolName: call.toolName,
            toolCallId: part.toolCallId,
            input: call.input,
            errorText: errorTextFrom(result?.output),
            state: "output-error",
          });
        }
      }
    }

    return yield* Effect.forEach(assistantParts, (part) =>
      Schema.decodeUnknownEffect(MessagePartSchema)(part).pipe(
        Effect.mapError((error) => new ChatMessagePartsError({ message: error.message })),
      ),
    );
  });

  static readonly buildAssistantParts = (
    messages: ReadonlyArray<unknown>,
  ): Promise<ReadonlyArray<MessagePart>> =>
    Effect.runPromise(ChatMessageParts.buildAssistantPartsEffect(messages));
}
