import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  isLoopFinished,
  stepCountIs,
  streamText,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
} from "ai";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import type { ChatMessage } from "../protocol/messages.ts";
import type { MessagePart } from "../protocol/parts.ts";
import type { GenerationEvent, ModelGenerationInput, ModelProvider } from "../protocol/model.ts";

export interface AiSdkModelConfiguration {
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly createId?: () => string;
}

export class AiSdkAdapterError extends Schema.TaggedErrorClass<AiSdkAdapterError>()(
  "AiSdkAdapterError",
  {
    code: Schema.String,
    message: Schema.String,
    retryable: Schema.Boolean,
  },
) {}

type AiSdkStreamPart = TextStreamPart<ToolSet>;

const JsonRecord = Schema.Record(Schema.String, Schema.Json);
const JsonValue = Schema.Json;

const toAdapterError = (cause: unknown): AiSdkAdapterError =>
  new AiSdkAdapterError({
    code: "provider-error",
    message: cause instanceof Error ? cause.message : String(cause),
    retryable: true,
  });

const decodeJsonRecord = (value: unknown) =>
  Schema.decodeUnknownEffect(JsonRecord)(value).pipe(
    Effect.mapError(
      (error) =>
        new AiSdkAdapterError({
          code: "malformed-tool-input",
          message: error.message,
          retryable: false,
        }),
    ),
  );

const decodeJsonValue = (value: unknown) =>
  Schema.decodeUnknownEffect(JsonValue)(value).pipe(
    Effect.mapError(
      (error) =>
        new AiSdkAdapterError({
          code: "malformed-tool-output",
          message: error.message,
          retryable: false,
        }),
    ),
  );

const toUiMessage = (message: ChatMessage): UIMessage => {
  const parts: UIMessage["parts"] = [];
  for (const part of message.parts) {
    if (part.type === "text" || part.type === "reasoning") {
      parts.push(part);
      continue;
    }
    if (part.type === "file") {
      parts.push({
        type: "file",
        filename: part.file.name,
        mediaType: part.file.mediaType,
        url: part.file.url,
      });
      continue;
    }
    if (part.type === "tool-call") {
      parts.push({
        type: "dynamic-tool",
        toolName: part.call.name,
        toolCallId: part.call.id,
        state: "input-available",
        input: part.call.input,
      });
      continue;
    }
    if (part.type === "tool-invocation") {
      if (part.state === "input-available") {
        parts.push({
          type: "dynamic-tool",
          toolName: part.toolName,
          toolCallId: part.toolCallId,
          state: "input-available",
          input: part.input,
        });
        continue;
      }
      if (part.state === "output-error") {
        parts.push({
          type: "dynamic-tool",
          toolName: part.toolName,
          toolCallId: part.toolCallId,
          state: "output-error",
          errorText: part.errorText ?? "Tool invocation failed.",
          input: part.input,
        });
        continue;
      }
      parts.push({
        type: "dynamic-tool",
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        state: "output-available",
        input: part.input,
        output: part.output ?? null,
      });
      continue;
    }
    if (part.result.isError === true) {
      parts.push({
        type: "dynamic-tool",
        toolName: "unknown",
        toolCallId: part.result.callId,
        state: "output-error",
        errorText: JSON.stringify(part.result.output),
        input: {},
      });
      continue;
    }
    parts.push({
      type: "dynamic-tool",
      toolName: "unknown",
      toolCallId: part.result.callId,
      state: "output-available",
      input: {},
      output: part.result.output,
    });
  }
  return {
    id: message.id,
    role: message.role === "tool" ? "assistant" : message.role,
    parts,
  };
};

const toMessagePart = ({
  event,
}: {
  event: AiSdkStreamPart;
}): Effect.Effect<MessagePart | undefined, AiSdkAdapterError> => {
  if (event.type === "text-delta") return Effect.succeed({ type: "text", text: event.text });
  if (event.type === "reasoning-delta")
    return Effect.succeed({ type: "reasoning", text: event.text });
  if (event.type === "tool-call")
    return decodeJsonRecord(event.input).pipe(
      Effect.map((input) => ({
        type: "tool-call" as const,
        call: { id: event.toolCallId, name: event.toolName, input },
      })),
    );
  if (event.type === "tool-result")
    return decodeJsonValue(event.output).pipe(
      Effect.map((output) => ({
        type: "tool-result" as const,
        result: { callId: event.toolCallId, output },
      })),
    );
  if (event.type === "tool-error")
    return Effect.succeed({
      type: "tool-result",
      result: {
        callId: event.toolCallId,
        output: event.error instanceof Error ? event.error.message : String(event.error),
        isError: true,
      },
    });
  if (event.type === "file")
    return Effect.fail(
      new AiSdkAdapterError({
        code: "unsupported-file-output",
        message: "AI SDK generated files are not supported by the generic model protocol.",
        retryable: false,
      }),
    );
  if (event.type === "error") return Effect.fail(toAdapterError(event.error));
  return Effect.succeed(undefined);
};

const appendPart = (
  parts: ReadonlyArray<MessagePart>,
  part: MessagePart,
): ReadonlyArray<MessagePart> => {
  const previous = parts.at(-1);
  if (
    previous !== undefined &&
    previous.type === part.type &&
    (part.type === "text" || part.type === "reasoning") &&
    (previous.type === "text" || previous.type === "reasoning")
  ) {
    return [...parts.slice(0, -1), { ...previous, text: previous.text + part.text }];
  }
  return [...parts, part];
};

type GenerationOutput = readonly [ReadonlyArray<MessagePart>, ReadonlyArray<GenerationEvent>];

const mapProviderEvent = (
  parts: ReadonlyArray<MessagePart>,
  event: AiSdkStreamPart,
  messageId: string,
  input: ModelGenerationInput,
): Effect.Effect<GenerationOutput, AiSdkAdapterError> =>
  toMessagePart({ event }).pipe(
    Effect.map((part): GenerationOutput => {
      if (part === undefined) {
        if (event.type !== "finish") return [parts, []];
        const message: ChatMessage = {
          id: messageId,
          role: "assistant",
          parts,
          createdAt: new Date().toISOString(),
          model: input.configuration.model,
        };
        return [parts, [{ type: "completed", message }]];
      }
      const nextParts = appendPart(parts, part);
      return [nextParts, [{ type: "message-part", part }]];
    }),
  );

const toGenerationStream = ({
  result,
  generationId,
  messageId,
  input,
}: {
  result: { readonly fullStream: AsyncIterable<AiSdkStreamPart> };
  generationId: string;
  messageId: string;
  input: ModelGenerationInput;
}): Stream.Stream<GenerationEvent, AiSdkAdapterError> => {
  const providerStream = Stream.fromAsyncIterable(result.fullStream, toAdapterError);
  const mapped: Stream.Stream<GenerationEvent, AiSdkAdapterError> = providerStream.pipe(
    Stream.mapAccumEffect(
      () => [] as ReadonlyArray<MessagePart>,
      (parts, event) => mapProviderEvent(parts, event, messageId, input),
    ),
  );
  return Stream.concat(Stream.succeed<GenerationEvent>({ type: "started", generationId }), mapped);
};

const generateWithConfiguration = ({
  configuration,
  input,
}: {
  readonly configuration: AiSdkModelConfiguration;
  readonly input: ModelGenerationInput;
}): Stream.Stream<GenerationEvent, AiSdkAdapterError> => {
  const createId = configuration.createId ?? (() => crypto.randomUUID());
  const generationId = createId();
  const messageId = createId();
  const messages = input.messages.map(toUiMessage).map(({ id: _id, ...message }) => message);
  const model = input.configuration.model || configuration.model;
  const resultEffect: Effect.Effect<
    Stream.Stream<GenerationEvent, AiSdkAdapterError>,
    AiSdkAdapterError
  > = Effect.tryPromise({
    try: async () => {
      const openai = createOpenAI({
        apiKey: configuration.apiKey,
        baseURL: configuration.baseUrl,
        ...(configuration.fetch === undefined ? {} : { fetch: configuration.fetch }),
      });
      const result = streamText({
        model: openai.chat(model),
        messages: await convertToModelMessages(messages),
        maxOutputTokens: 4096,
        stopWhen: [isLoopFinished(), stepCountIs(8)],
      });
      return toGenerationStream({ result, generationId, messageId, input });
    },
    catch: (cause) => toAdapterError(cause),
  });
  return Stream.unwrap(resultEffect);
};

export interface AiSdkModelProviderShape extends ModelProvider {}

export class AiSdkModelProvider extends Context.Service<
  AiSdkModelProvider,
  AiSdkModelProviderShape
>()("@emi/core/adapters/AiSdkModelProvider") {
  static layer(configuration: AiSdkModelConfiguration) {
    return Layer.succeed(AiSdkModelProvider, {
      generate: (input) => generateWithConfiguration({ configuration, input }),
    });
  }
}
