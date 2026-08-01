import { DefaultChatTransport, readUIMessageStream, type FileUIPart, type UIMessage } from "ai";
import { fromCallback } from "xstate";

import type { ChatSessionEvent, QueuedFollowUp } from "../chat-session-machine.ts";

export interface ChatTransportRequest {
  conversationId: string | undefined;
  threadId: string | undefined;
  temporary: boolean;
  messages: UIMessage[];
  text: string;
  files: FileUIPart[];
  body: Record<string, unknown>;
}

export interface ChatTransportActorInput {
  api: string;
  fetch: typeof globalThis.fetch;
  createId: () => string;
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

const errorMessage = ({ cause, fallback }: { cause: unknown; fallback: string }): string =>
  cause instanceof Error ? cause.message : fallback;

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

    const createTransport = ({ controller }: { controller: AbortController }) =>
      new DefaultChatTransport<UIMessage>({
        api: input.api,
        fetch: async (request, init) => {
          const response = await input.fetch(request, { ...init, signal: controller.signal });
          const conversationId = response.headers.get("x-conversation-id");
          if (conversationId !== null) {
            input.sendSession({ type: "conversation-identified", conversationId });
          }
          return response;
        },
      });

    const consumeStream = async ({
      activeOperation,
      stream,
    }: {
      activeOperation: number;
      stream: ReadableStream<
        Parameters<typeof readUIMessageStream>[0]["stream"] extends ReadableStream<infer Chunk>
          ? Chunk
          : never
      >;
    }) => {
      for await (const message of readUIMessageStream({ stream, terminateOnError: true })) {
        if (activeOperation !== operation) return;
        input.sendSession({ type: "stream-message", message });
      }
    };

    const send = async ({ request }: { request: ChatTransportRequest }) => {
      const controller = new AbortController();
      const activeOperation = supersede();
      abortController = controller;
      const message: UIMessage = {
        id: input.createId(),
        role: "user",
        parts: [{ type: "text", text: request.text }, ...request.files],
      };
      const messages = [...request.messages, message];
      input.sendSession({ type: "stream-started", messages });

      try {
        const stream = await createTransport({ controller }).sendMessages({
          trigger: "submit-message",
          chatId: request.conversationId ?? message.id,
          messageId: message.id,
          messages,
          abortSignal: controller.signal,
          body: {
            ...request.body,
            sessionId: request.conversationId,
            threadId: request.threadId,
            temporary: request.temporary,
          },
        });
        await consumeStream({ activeOperation, stream });
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

    const resume = async ({ conversationId }: { conversationId: string }) => {
      const controller = new AbortController();
      const activeOperation = supersede();
      abortController = controller;
      input.sendSession({ type: "stream-resumed" });

      try {
        const stream = await createTransport({ controller }).reconnectToStream({
          chatId: conversationId,
        });
        if (stream === null) return;
        await consumeStream({ activeOperation, stream });
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
    };

    receive((event) => {
      if (event.type === "stream-send-requested") void send({ request: event.request });
      if (event.type === "stream-resume-requested" || event.type === "stream-retry-requested") {
        void resume({ conversationId: event.conversationId });
      }
      if (event.type === "stream-cancelled") {
        supersede();
        input.sendSession({ type: "stream-finished" });
      }
      if (event.type === "queued-follow-up-force-requested") {
        supersede();
        input.sendSession({ type: "queued-follow-up-forced", id: event.followUp.id });
        void send({ request: { ...event.request, ...event.followUp } });
      }
    });

    return () => {
      supersede();
    };
  },
);
