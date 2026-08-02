import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { fromCallback } from "xstate";

import type {
  Attachment,
  ChatMessage,
  MessagePart,
} from "../../protocol/index.ts";
import type { ChatSessionEvent, QueuedFollowUp } from "../chat-session-machine.ts";

export interface ChatTransportRequest {
  conversationId: string | undefined;
  threadId: string | undefined;
  temporary: boolean;
  messages: ChatMessage[];
  text: string;
  files: Attachment[];
  body: Record<string, unknown>;
}

export interface ChatTransportActorInput {
  api: string;
  fetch: typeof globalThis.fetch;
  createId: () => string;
  now: () => string;
  sendSession: (event: ChatSessionEvent) => void;
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
  const current =
    message ?? {
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

const responseStream = (response: Response): ReadableStream<string> => {
  if (response.body === null) throw new Error("Chat response did not contain a stream.");
  return response.body.pipeThrough(new TextDecoderStream());
};

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
        id: input.createId(),
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
      await consumeStream({ activeOperation, response, now: input.now });
    };

    const consumeStream = async ({
      activeOperation,
      response,
      now,
    }: {
      activeOperation: number;
      response: Response;
      now: () => string;
    }) => {
      let buffer = "";
      let message: ChatMessage | undefined;
      for await (const chunk of responseStream(response)) {
        if (activeOperation !== operation) return;
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
              id: decoded.value.messageId ?? input.createId(),
              role: "assistant",
              parts: [],
              createdAt: now(),
            };
            input.sendSession({ type: "stream-message", message });
          }
          if (decoded.value.type === "text-delta") {
            message = appendText({ message, text: decoded.value.delta, now });
            input.sendSession({ type: "stream-message", message });
          }
        }
      }
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
        await sendRequest({ activeOperation, controller, request });
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
          const response = await input.fetch(`${input.api}/${encodeURIComponent(conversationId)}/stream`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Chat resume failed (${response.status}).`);
          await consumeStream({ activeOperation, response, now: input.now });
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
