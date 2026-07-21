import * as Effect from "effect/Effect";
import { type EventFrom, type SnapshotFrom } from "xstate";
import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject } from "react";
import { fetchConversationMessages, type ConversationSnapshot } from "../conversations";
import { notifyConversationsChanged } from "../conversation-events";
import { getConversationViewMessages } from "./conversation-tree";
import { chatRuntimeMachine } from "./chat-runtime-machine";
import type { ChatRuntimeConfig } from "./chat-runtime-context";
import { consumeAssistantStream, type ChatTransport } from "./chat-transport";
import { shouldAcceptStreamUpdate } from "./stream-operation";

type ChatRuntimeSnapshot = SnapshotFrom<typeof chatRuntimeMachine>;
type ChatRuntimeEvent = EventFrom<typeof chatRuntimeMachine>;

export const shouldApplyHistoryChange = ({
  historyReady,
  isStreamingSameSession,
}: {
  historyReady: boolean;
  isStreamingSameSession: boolean;
}): boolean => historyReady && !isStreamingSameSession;

export const useChatHistorySync = ({
  config,
  stateRef,
  send,
  operationRef,
  abortControllerRef,
  cancelStreamRef,
  transport,
  onHistoryChanged,
  recordClientEvent,
}: {
  config: ChatRuntimeConfig;
  stateRef: MutableRefObject<ChatRuntimeSnapshot>;
  send: (event: ChatRuntimeEvent) => void;
  operationRef: MutableRefObject<number>;
  abortControllerRef: MutableRefObject<AbortController | null>;
  cancelStreamRef: MutableRefObject<(() => void) | null>;
  transport: ChatTransport;
  onHistoryChanged?: (snapshot: ConversationSnapshot) => void;
  recordClientEvent: (type: "client.disconnected") => void;
}) => {
  const historySignatureRef = useRef("");
  const resumeSessionRef = useRef<string | undefined>(undefined);
  const historySignature = `${config.sessionId ?? "new"}:${config.threadId ?? "root"}:${config.initialMessages
    .map((message) => message.id)
    .join(",")}`;

  const synchronizePersistedHistory = useCallback(
    async (sessionId: string) => {
      const snapshot = await fetchConversationMessages(sessionId);
      const thread = snapshot.threads.find((candidate) => candidate.id === config.threadId);
      const messages = getConversationViewMessages({ messages: snapshot.messages, thread }).flatMap(
        (message) =>
          message.role !== "user" && message.role !== "assistant"
            ? []
            : [{ id: message.id, role: message.role, parts: message.parts }],
      );
      onHistoryChanged?.(snapshot);
      send({ type: "history.changed", sessionId, messages });
      return snapshot;
    },
    [config.threadId, onHistoryChanged, send],
  );

  useLayoutEffect(() => {
    if (historySignatureRef.current === historySignature) return;
    const isStreamingSameSession =
      stateRef.current.matches("streaming") &&
      stateRef.current.context.sessionId === config.sessionId;
    if (
      !shouldApplyHistoryChange({
        historyReady: config.historyReady,
        isStreamingSameSession,
      })
    ) {
      return;
    }
    historySignatureRef.current = historySignature;
    operationRef.current += 1;
    abortControllerRef.current?.abort();
    cancelStreamRef.current?.();
    send({
      type: "history.changed",
      sessionId: config.sessionId,
      messages: config.initialMessages,
    });
  }, [
    abortControllerRef,
    cancelStreamRef,
    config.historyReady,
    config.initialMessages,
    config.sessionId,
    historySignature,
    operationRef,
    send,
    stateRef,
  ]);

  useEffect(() => {
    const sessionId = config.sessionId;
    if (
      sessionId === undefined ||
      config.temporary ||
      !config.historyReady ||
      resumeSessionRef.current === sessionId
    )
      return;
    if (stateRef.current.matches("streaming") && stateRef.current.context.sessionId === sessionId) {
      resumeSessionRef.current = sessionId;
      return;
    }
    resumeSessionRef.current = sessionId;
    const resume = async () => {
      const operation = operationRef.current + 1;
      operationRef.current = operation;
      send({ type: "history.changed", sessionId, messages: config.initialMessages });
      send({ type: "resume.started" });
      const stream = await transport.reconnectToStream({ chatId: sessionId });
      if (stream === null) {
        if (
          shouldAcceptStreamUpdate({
            activeOperation: operationRef.current,
            eventOperation: operation,
          })
        ) {
          send({ type: "stream.completed" });
        }
        await synchronizePersistedHistory(sessionId);
        notifyConversationsChanged();
        return;
      }
      await consumeAssistantStream({
        stream,
        onMessage: (message) => {
          if (
            shouldAcceptStreamUpdate({
              activeOperation: operationRef.current,
              eventOperation: operation,
            })
          ) {
            send({ type: "stream.updated", message });
          }
        },
        cancelRef: cancelStreamRef,
      });
      if (
        !shouldAcceptStreamUpdate({
          activeOperation: operationRef.current,
          eventOperation: operation,
        })
      ) {
        return;
      }
      send({ type: "stream.completed" });
      await synchronizePersistedHistory(sessionId);
      notifyConversationsChanged();
    };
    void resume().catch((error) => {
      if (stateRef.current.context.sessionId !== sessionId) return;
      Effect.runSync(
        Effect.logWarning("chat.browser.reconnect.failure").pipe(
          Effect.annotateLogs({
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      );
      send({
        type: "stream.failed",
        error: error instanceof Error ? error : new Error(String(error)),
        messageId: config.initialMessages.findLast((message) => message.role === "user")?.id,
      });
      recordClientEvent("client.disconnected");
    });
  }, [
    cancelStreamRef,
    config.initialMessages,
    config.historyReady,
    config.sessionId,
    config.temporary,
    operationRef,
    recordClientEvent,
    send,
    stateRef,
    synchronizePersistedHistory,
    transport,
  ]);

  return { synchronizePersistedHistory };
};
