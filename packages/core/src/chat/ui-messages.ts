import {
  isDynamicToolUIPart,
  isFileUIPart,
  isReasoningUIPart,
  isStaticToolUIPart,
  isTextUIPart,
  safeValidateUIMessages,
  type SafeValidateUIMessagesResult,
  type UIMessage,
} from "ai";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { MessagePart } from "../protocol/parts.ts";
import { MessagePartSchema } from "../protocol/parts.ts";

type UiMessagePart = UIMessage["parts"][number];
type UiToolPart = Extract<UiMessagePart, { type: `tool-${string}` | "dynamic-tool" }>;

class ChatUiMessagesError extends Schema.TaggedErrorClass<ChatUiMessagesError>()(
  "ChatUiMessagesError",
  {
    code: Schema.String,
    message: Schema.String,
  },
) {}

const defaultCreateId = (): string => crypto.randomUUID();

// AI SDK v6 emits step-start markers for every streamed step; the protocol
// models one assistant message without step boundaries, so they are skipped.
const isStepStartUIPart = (part: UiMessagePart): boolean => part.type === "step-start";

const unsupportedPart = (part: UiMessagePart): ChatUiMessagesError =>
  new ChatUiMessagesError({
    code: "unsupported-ui-message-part",
    message: `The AI SDK message part ${part.type} has no provider-neutral protocol representation.`,
  });

const decodeJson = (value: unknown, field: string) =>
  Schema.decodeUnknownEffect(Schema.Json)(value).pipe(
    Effect.mapError(
      () =>
        new ChatUiMessagesError({
          code: "invalid-ui-message-json",
          message: `The AI SDK ${field} is not JSON-compatible.`,
        }),
    ),
  );

const decodeMessagePart = (value: unknown) =>
  Schema.decodeUnknownEffect(MessagePartSchema)(value).pipe(
    Effect.mapError(
      (error) =>
        new ChatUiMessagesError({
          code: "invalid-protocol-message-part",
          message: error.message,
        }),
    ),
  );

const toolNameOf = (part: UiToolPart): string =>
  isDynamicToolUIPart(part) ? part.toolName : part.type.slice("tool-".length);

const toToolInvocation = ({
  part,
}: {
  readonly part: UiToolPart;
}): Effect.Effect<MessagePart, ChatUiMessagesError> => {
  const inputEffect = decodeJson(part.input ?? {}, "tool input");
  const toolName = toolNameOf(part);
  const common = {
    type: "tool-invocation" as const,
    toolName,
    toolCallId: part.toolCallId,
  };

  if (part.state === "input-streaming" || part.state === "input-available") {
    return inputEffect.pipe(
      Effect.flatMap((input) => decodeMessagePart({ ...common, state: "input-available", input })),
    );
  }

  if (part.state === "output-available") {
    return Effect.all({ input: inputEffect, output: decodeJson(part.output, "tool output") }).pipe(
      Effect.flatMap(({ input, output }) =>
        decodeMessagePart({ ...common, state: "output-available", input, output }),
      ),
    );
  }

  if (part.state === "output-error") {
    return inputEffect.pipe(
      Effect.flatMap((input) =>
        decodeMessagePart({
          ...common,
          state: "output-error",
          input,
          errorText: part.errorText,
        }),
      ),
    );
  }

  if (part.state === "output-denied") {
    return inputEffect.pipe(
      Effect.flatMap((input) =>
        decodeMessagePart({
          ...common,
          state: "output-error",
          input,
          errorText: part.approval.reason ?? "Tool invocation denied.",
        }),
      ),
    );
  }

  return Effect.fail(
    new ChatUiMessagesError({
      code: "unsupported-tool-state",
      message: `The AI SDK tool part ${toolName} is awaiting an approval state that the protocol does not model.`,
    }),
  );
};

const toProtocolPart = ({
  part,
  createId,
}: {
  readonly part: UiMessagePart;
  readonly createId: () => string;
}): Effect.Effect<MessagePart, ChatUiMessagesError> => {
  if (isTextUIPart(part)) return decodeMessagePart({ type: "text", text: part.text });
  if (isReasoningUIPart(part)) {
    return decodeMessagePart({ type: "reasoning", text: part.text });
  }
  if (isFileUIPart(part)) {
    return decodeMessagePart({
      type: "file",
      file: {
        id: createId(),
        name: part.filename ?? "attachment",
        mediaType: part.mediaType,
        url: part.url,
      },
    });
  }
  if (isStaticToolUIPart(part) || isDynamicToolUIPart(part)) {
    return toToolInvocation({ part });
  }
  return Effect.fail(unsupportedPart(part));
};

const toUiPart = (part: MessagePart): UiMessagePart => {
  if (part.type === "text" || part.type === "reasoning") return part;
  if (part.type === "file") {
    return {
      type: "file",
      filename: part.file.name,
      mediaType: part.file.mediaType,
      url: part.file.url,
    };
  }
  if (part.type === "tool-call") {
    return {
      type: "dynamic-tool",
      toolName: part.call.name,
      toolCallId: part.call.id,
      state: "input-available",
      input: part.call.input,
    };
  }
  if (part.type === "tool-result") {
    return part.result.isError === true
      ? {
          type: "dynamic-tool",
          toolName: "unknown",
          toolCallId: part.result.callId,
          state: "output-error",
          input: {},
          errorText: JSON.stringify(part.result.output),
        }
      : {
          type: "dynamic-tool",
          toolName: "unknown",
          toolCallId: part.result.callId,
          state: "output-available",
          input: {},
          output: part.result.output,
        };
  }
  if (part.state === "input-available") {
    return {
      type: "dynamic-tool",
      toolName: part.toolName,
      toolCallId: part.toolCallId,
      state: "input-available",
      input: part.input,
    };
  }
  if (part.state === "output-error") {
    return {
      type: "dynamic-tool",
      toolName: part.toolName,
      toolCallId: part.toolCallId,
      state: "output-error",
      input: part.input,
      errorText: part.errorText ?? "Tool invocation failed.",
    };
  }
  return {
    type: "dynamic-tool",
    toolName: part.toolName,
    toolCallId: part.toolCallId,
    state: "output-available",
    input: part.input,
    output: part.output ?? null,
  };
};

const validationError = (cause: unknown): ChatUiMessagesError =>
  new ChatUiMessagesError({
    code: "ui-message-validation-failed",
    message: cause instanceof Error ? cause.message : String(cause),
  });

export class ChatUiMessages {
  static toProtocolPartsEffect({
    parts,
    createId = defaultCreateId,
  }: {
    readonly parts: ReadonlyArray<UiMessagePart>;
    readonly createId?: () => string;
  }): Effect.Effect<ReadonlyArray<MessagePart>, ChatUiMessagesError> {
    return Effect.forEach(
      parts.filter((part) => !isStepStartUIPart(part)),
      (part) => toProtocolPart({ part, createId }),
    );
  }

  static toProtocolParts({
    parts,
    createId,
  }: {
    readonly parts: ReadonlyArray<UiMessagePart>;
    readonly createId?: () => string;
  }): Promise<ReadonlyArray<MessagePart>> {
    return Effect.runPromise(ChatUiMessages.toProtocolPartsEffect({ parts, createId }));
  }

  static fromProtocolMessage({
    id,
    role,
    parts,
  }: {
    readonly id: string;
    readonly role: "user" | "assistant" | "system" | "tool";
    readonly parts: ReadonlyArray<MessagePart>;
  }): UIMessage {
    return {
      id,
      role: role === "tool" ? "assistant" : role,
      parts: parts.map(toUiPart),
    };
  }

  static validateUIMessagesEffect<T extends UIMessage>(
    messages: unknown,
  ): Effect.Effect<SafeValidateUIMessagesResult<T>, ChatUiMessagesError> {
    return Effect.tryPromise({
      try: () => safeValidateUIMessages<T>({ messages }),
      catch: validationError,
    });
  }

  static validateStoredUIMessagesEffect(
    messages: ReadonlyArray<unknown>,
  ): Effect.Effect<UIMessage[], ChatUiMessagesError> {
    if (messages.length === 0) return Effect.succeed([]);
    return ChatUiMessages.validateUIMessagesEffect<UIMessage>(messages).pipe(
      Effect.flatMap((validatedMessages) => {
        if (!validatedMessages.success) {
          return Effect.fail(
            new ChatUiMessagesError({
              code: "invalid-ui-message",
              message: validatedMessages.error.message,
            }),
          );
        }
        if (validatedMessages.data.some((message) => message.id.trim() === "")) {
          return Effect.fail(
            new ChatUiMessagesError({
              code: "invalid-ui-message-id",
              message: "UI messages require non-empty identifiers",
            }),
          );
        }
        return Effect.succeed(validatedMessages.data);
      }),
    );
  }

  static validateStoredUIMessages(messages: ReadonlyArray<unknown>): Promise<UIMessage[]> {
    return Effect.runPromise(ChatUiMessages.validateStoredUIMessagesEffect(messages));
  }
}
