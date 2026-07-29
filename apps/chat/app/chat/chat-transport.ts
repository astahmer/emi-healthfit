import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { DefaultChatTransport, readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import { useMemo, type MutableRefObject } from "react";
import { runApi } from "../api-client";
import { parseChatConflictError } from "./orphan-turn-error";

export type DiagnosticEventType =
  | "client.submitted"
  | "client.disconnected"
  | "client.reconnected"
  | "client.stopped"
  | "client.refreshed"
  | "client.retried";

export type ChatTransport = DefaultChatTransport<UIMessage>;

const defaultInactivityTimeoutMilliseconds = 5 * 60 * 1_000;

export class StreamInactivityError extends Error {
  constructor() {
    super("Chat response stalled before completion.");
    this.name = "StreamInactivityError";
  }
}

export const recordDiagnosticEvent = ({
  conversationId,
  generationId,
  type,
}: {
  conversationId: string;
  generationId: string;
  type: DiagnosticEventType;
}) =>
  runApi((client) =>
    client.conversations.recordDiagnosticEvent({
      params: { id: conversationId },
      payload: { generationId, type },
    }),
  );

export const useChatTransport = ({
  temporary,
  generationIdRef,
}: {
  temporary: boolean;
  generationIdRef: MutableRefObject<string | null>;
}): ChatTransport =>
  useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          const conflictError = await parseChatConflictError(response);
          if (conflictError !== undefined) throw conflictError;
          const generationId = response.headers.get("x-generation-id");
          const conversationId = response.headers.get("x-thread-id");
          if (!temporary && generationId !== null && conversationId !== null) {
            generationIdRef.current = generationId;
            const method = init?.method?.toUpperCase() ?? "GET";
            const eventTypes: ReadonlyArray<DiagnosticEventType> =
              method === "POST" ? ["client.submitted"] : ["client.refreshed", "client.reconnected"];
            for (const type of eventTypes) {
              void recordDiagnosticEvent({ conversationId, generationId, type });
            }
          }
          return response;
        },
      }),
    [generationIdRef, temporary],
  );

export const consumeAssistantStream = async ({
  stream,
  onMessage,
  cancelRef,
  inactivityTimeoutMilliseconds = defaultInactivityTimeoutMilliseconds,
}: {
  stream: ReadableStream<UIMessageChunk>;
  onMessage: (message: UIMessage) => void;
  cancelRef: MutableRefObject<(() => void) | null>;
  inactivityTimeoutMilliseconds?: number;
}): Promise<void> => {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const streamStartedAt = performance.now();
  let previousChunkAt = streamStartedAt;
  let chunkCount = 0;
  let inactivityTimeout: ReturnType<typeof setTimeout> | undefined;
  let streamTimedOut = false;
  const resetInactivityTimeout = () => {
    if (inactivityTimeout !== undefined) clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(() => {
      streamTimedOut = true;
      controller.abort();
    }, inactivityTimeoutMilliseconds);
  };
  cancelRef.current = cancel;
  resetInactivityTimeout();
  try {
    await Effect.runPromise(
      Stream.fromAsyncIterable(readUIMessageStream({ stream, terminateOnError: true }), (error) =>
        error instanceof Error ? error : new Error(String(error)),
      ).pipe(
        Stream.runForEach((message) =>
          Effect.gen(function* () {
            const timestamp = performance.now();
            yield* Effect.logDebug("chat.browser.chunk").pipe(
              Effect.annotateLogs({
                boundary: "default-transport",
                chunkIndex: chunkCount,
                timeToFirstChunkMilliseconds:
                  chunkCount === 0 ? Math.round(timestamp - streamStartedAt) : undefined,
                interChunkLatencyMilliseconds:
                  chunkCount === 0 ? undefined : Math.round(timestamp - previousChunkAt),
              }),
            );
            if (message.id.trim() === "") {
              throw new Error("Streamed messages require non-empty identifiers");
            }
            resetInactivityTimeout();
            onMessage(message);
            yield* Effect.logDebug("chat.browser.chunk").pipe(
              Effect.annotateLogs({
                boundary: "xstate-stream-updated",
                chunkIndex: chunkCount,
                dispatchLatencyMilliseconds: Math.round(performance.now() - timestamp),
              }),
            );
            chunkCount += 1;
            previousChunkAt = timestamp;
          }),
        ),
      ),
      { signal: controller.signal },
    );
  } catch (error) {
    if (streamTimedOut) throw new StreamInactivityError();
    throw error;
  } finally {
    if (inactivityTimeout !== undefined) clearTimeout(inactivityTimeout);
    if (cancelRef.current === cancel) cancelRef.current = null;
  }
};
