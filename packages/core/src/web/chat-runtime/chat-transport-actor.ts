import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { fromCallback } from "xstate";

import type { ChatMessage } from "../../protocol/messages.ts";
import type { Attachment, MessagePart } from "../../protocol/parts.ts";
import { ChatModelConfigurationSchema } from "../../chat/request.ts";
import type { ChatModelConfiguration } from "../../chat/request.ts";
import type { ChatSessionEvent, QueuedFollowUp } from "../chat-session-machine.ts";

export interface ChatTransportRequest {
  conversationId: string | undefined;
  threadId: string | undefined;
  temporary: boolean;
  messages: ChatMessage[];
  text: string;
  files: Attachment[];
  messageId?: string;
  replaceMessageId?: string;
  body: Record<string, unknown>;
}

export interface ChatTransportActorInput {
  api: string;
  fetch: typeof globalThis.fetch;
  createId: () => string;
  now: () => string;
  sendSession: (event: ChatSessionEvent) => void;
  sendSuggestions?: (input: {
    readonly lastAssistantText: string;
    readonly lastUserText: string;
    readonly threadId: string | undefined;
    readonly messageId: string | undefined;
    readonly config: ChatModelConfiguration;
  }) => void;
}

export type ChatTransportActorEvent =
  | { type: "stream-send-requested"; request: ChatTransportRequest }
  | { type: "stream-resume-requested"; conversationId: string }
  | { type: "stream-retry-requested"; conversationId: string }
  | { type: "stream-cancelled" }
  | {
      type: "queued-follow-up-force-requested";
      followUp: QueuedFollowUp;
      request: Omit<ChatTransportRequest, "files" | "text">;
    };

const WireChunk = Schema.Union([
  Schema.Struct({ type: Schema.Literal("start"), messageId: Schema.optional(Schema.String) }),
  Schema.Struct({ type: Schema.Literal("text-start"), id: Schema.String }),
  Schema.Struct({ type: Schema.Literal("text-delta"), id: Schema.String, delta: Schema.String }),
  Schema.Struct({ type: Schema.Literal("text-end"), id: Schema.String }),
  Schema.Struct({ type: Schema.Literal("finish") }),
]);

type WireChunk = typeof WireChunk.Type;

class ChatTransportStreamError extends Schema.TaggedErrorClass<ChatTransportStreamError>()(
  "ChatTransportStreamError",
  { message: Schema.String },
) {}

const errorMessage = ({ cause, fallback }: { cause: unknown; fallback: string }): string =>
  cause instanceof Error ? cause.message : fallback;

const readWireChunk = (data: string): Option.Option<WireChunk> =>
  Schema.decodeUnknownOption(Schema.fromJsonString(WireChunk))(data);

const appendText = ({
  message,
  text,
  now,
}: {
  message: ChatMessage | undefined;
  text: string;
  now: () => string;
}): ChatMessage => {
  const current = message ?? {
    id: `assistant:${now()}`,
    role: "assistant" as const,
    parts: [],
    createdAt: now(),
  };
  const previous = current.parts.at(-1);
  const parts: ReadonlyArray<MessagePart> =
    previous?.type === "text"
      ? [...current.parts.slice(0, -1), { type: "text", text: previous.text + text }]
      : [...current.parts, { type: "text", text }];
  return { ...current, parts };
};

const assistantText = (message: ChatMessage): string =>
  message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

const consumeStreamEffect = Effect.fn("chat.transport.consumeStream")(function* ({
  activeOperation,
  response,
  now,
  createId,
  sendSession,
  isCurrent,
}: {
  activeOperation: number;
  response: Response;
  now: () => string;
  createId: () => string;
  sendSession: (event: ChatSessionEvent) => void;
  isCurrent: (activeOperation: number) => boolean;
}) {
  const body = response.body;
  if (body === null)
    return yield* Effect.fail(
      new ChatTransportStreamError({ message: "Chat response did not contain a stream." }),
    );

  let buffer = "";
  let message: ChatMessage | undefined;
  yield* Stream.fromReadableStream({
    evaluate: () => body.pipeThrough(new TextDecoderStream()),
    onError: (cause) =>
      new ChatTransportStreamError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
    releaseLockOnEnd: true,
  }).pipe(
    Stream.takeWhile(() => isCurrent(activeOperation)),
    Stream.runForEach((chunk) =>
      Effect.sync(() => {
        buffer += chunk;
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const data = event
            .split("\n")
            .find((line) => line.startsWith("data:"))
            ?.slice("data:".length)
            .trim();
          if (data === undefined || data === "[DONE]") continue;
          const decoded = readWireChunk(data);
          if (Option.isNone(decoded)) continue;
          if (decoded.value.type === "start") {
            message = {
              id: decoded.value.messageId ?? createId(),
              role: "assistant",
              parts: [],
              createdAt: now(),
            };
            sendSession({ type: "stream-message", message });
          }
          if (decoded.value.type === "text-delta") {
            message = appendText({ message, text: decoded.value.delta, now });
            sendSession({ type: "stream-message", message });
          }
        }
      }),
    ),
  );
  return message;
});

export const chatTransportActor = fromCallback<ChatTransportActorEvent, ChatTransportActorInput>(
  ({ input, receive }) => {
    let abortController: AbortController | undefined;
    let operation = 0;

    const supersede = () => {
      operation += 1;
      abortController?.abort();
      abortController = undefined;
      return operation;
    };

    const sendRequest = async ({
      activeOperation,
      controller,
      request,
    }: {
      activeOperation: number;
      controller: AbortController;
      request: ChatTransportRequest;
    }) => {
      const message: ChatMessage = {
        id: request.messageId ?? input.createId(),
        role: "user",
        parts: [
          ...(request.text === "" ? [] : [{ type: "text" as const, text: request.text }]),
          ...request.files.map((file) => ({ type: "file" as const, file })),
        ],
        createdAt: input.now(),
      };
      const messages = [...request.messages, message];
      input.sendSession({ type: "stream-started", messages });
      const response = await input.fetch(input.api, {
        body: JSON.stringify({
          ...request.body,
          messages,
          sessionId: request.conversationId,
          threadId: request.threadId,
          temporary: request.temporary,
          ...(request.replaceMessageId === undefined
            ? {}
            : { replaceMessageId: request.replaceMessageId }),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
      const conversationId = response.headers.get("x-conversation-id");
      if (conversationId !== null) {
        input.sendSession({ type: "conversation-identified", conversationId });
      }
      if (!response.ok) throw new Error(`Chat request failed (${response.status}).`);
      return await Effect.runPromise(
        consumeStreamEffect({
          activeOperation,
          response,
          now: input.now,
          createId: input.createId,
          sendSession: input.sendSession,
          isCurrent: (currentOperation) => currentOperation === operation,
        }),
      );
    };

    const run = async ({
      request,
      activeOperation,
      controller,
    }: {
      request: ChatTransportRequest;
      activeOperation: number;
      controller: AbortController;
    }) => {
      try {
        const message = await sendRequest({ activeOperation, controller, request });
        if (message !== undefined && input.sendSuggestions !== undefined) {
          const text = assistantText(message);
          if (text !== "")
            input.sendSuggestions({
              lastAssistantText: text,
              lastUserText: request.text,
              threadId: request.threadId,
              messageId: message.id,
              config: Schema.decodeUnknownSync(ChatModelConfigurationSchema)(request.body.config),
            });
        }
      } catch (cause) {
        if (controller.signal.aborted || activeOperation !== operation) return;
        input.sendSession({
          type: "error-reported",
          error: errorMessage({ cause, fallback: "Unable to complete this chat request." }),
        });
      } finally {
        if (abortController === controller) abortController = undefined;
        if (activeOperation === operation) input.sendSession({ type: "stream-finished" });
      }
    };

    const send = (request: ChatTransportRequest) => {
      const controller = new AbortController();
      const activeOperation = supersede();
      abortController = controller;
      void run({ request, activeOperation, controller });
    };

    const resume = (conversationId: string) => {
      const controller = new AbortController();
      const activeOperation = supersede();
      abortController = controller;
      input.sendSession({ type: "stream-resumed" });
      void (async () => {
        try {
          const response = await input.fetch(
            `${input.api}/${encodeURIComponent(conversationId)}/stream`,
            {
              signal: controller.signal,
            },
          );
          if (!response.ok) throw new Error(`Chat resume failed (${response.status}).`);
          await Effect.runPromise(
            consumeStreamEffect({
              activeOperation,
              response,
              now: input.now,
              createId: input.createId,
              sendSession: input.sendSession,
              isCurrent: (currentOperation) => currentOperation === operation,
            }),
          );
        } catch (cause) {
          if (controller.signal.aborted || activeOperation !== operation) return;
          input.sendSession({
            type: "error-reported",
            error: errorMessage({ cause, fallback: "Unable to resume this conversation." }),
          });
        } finally {
          if (abortController === controller) abortController = undefined;
          if (activeOperation === operation) input.sendSession({ type: "stream-finished" });
        }
      })();
    };

    receive((event) => {
      if (event.type === "stream-send-requested") send(event.request);
      if (event.type === "stream-resume-requested" || event.type === "stream-retry-requested")
        resume(event.conversationId);
      if (event.type === "stream-cancelled") {
        supersede();
        input.sendSession({ type: "stream-finished" });
      }
      if (event.type === "queued-follow-up-force-requested") {
        supersede();
        input.sendSession({ type: "queued-follow-up-forced", id: event.followUp.id });
        send({ ...event.request, ...event.followUp });
      }
    });

    return () => {
      supersede();
    };
  },
);
