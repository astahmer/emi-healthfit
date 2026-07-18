"use client";

import { useMachine } from "@xstate/react";
import { convertFileListToFileUIParts } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNotes } from "../notes-context";
import { useSettings } from "../settings-store";
import { prepareAttachments } from "./attachments";
import { chatRuntimeMachine } from "./chat-runtime-machine";
import {
  ChatRuntimeContext,
  type ChatRuntimeConfig,
  type ChatRuntimeValue,
} from "./chat-runtime-context";
import { recordDiagnosticEvent, useChatTransport } from "./chat-transport";
import { useChatHistorySync } from "./use-chat-history-sync";
import { useChatSubmission } from "./use-chat-submission";
import { OrphanTurnError } from "./orphan-turn-error";
import type { ConversationSnapshot } from "../conversations";

export type { ChatRuntimeConfig } from "./chat-runtime-context";
export { useChatRuntime } from "./chat-runtime-context";

export const ChatRuntimeProvider = ({
  config,
  onSessionCreated,
  onHistoryChanged,
  children,
}: {
  config: ChatRuntimeConfig;
  onSessionCreated?: (id: string) => void;
  onHistoryChanged?: (snapshot: ConversationSnapshot) => void;
  children: ReactNode;
}) => {
  const settings = useSettings((state) => state.settings);
  const { notes } = useNotes();
  const [state, send] = useMachine(chatRuntimeMachine, {
    input: { sessionId: config.sessionId, messages: config.initialMessages },
  });
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isPreparingAttachments, setIsPreparingAttachments] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);
  const operationRef = useRef(0);
  const generationIdRef = useRef<string | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const transport = useChatTransport({
    temporary: config.temporary,
    generationIdRef,
  });
  const recordClientEvent = useCallback(
    (type: "client.disconnected" | "client.stopped" | "client.retried") => {
      const conversationId = stateRef.current.context.sessionId;
      const generationId = generationIdRef.current;
      if (config.temporary || conversationId === undefined || generationId === null) return;
      void recordDiagnosticEvent({ conversationId, generationId, type });
    },
    [config.temporary],
  );
  const { synchronizePersistedHistory } = useChatHistorySync({
    config,
    stateRef,
    send,
    operationRef,
    abortControllerRef,
    cancelStreamRef,
    transport,
    onHistoryChanged,
    recordClientEvent,
  });
  const { submit, revise, retryOrphan } = useChatSubmission({
    config,
    settings,
    notes,
    stateRef,
    send,
    operationRef,
    abortControllerRef,
    cancelStreamRef,
    transport,
    synchronizePersistedHistory,
    onSessionCreated,
    recordClientEvent,
  });

  const value = useMemo<ChatRuntimeValue>(() => {
    const selectionMatchesRuntime = state.context.sessionId === config.sessionId;
    return {
      messages: selectionMatchesRuntime ? state.context.messages : config.initialMessages,
      sessionId: config.sessionId,
      draft: selectionMatchesRuntime ? state.context.draft : "",
      files: selectionMatchesRuntime ? state.context.files : [],
      isStreaming: selectionMatchesRuntime && state.matches("streaming"),
      error: state.context.error,
      errorMessageId:
        state.context.error instanceof OrphanTurnError
          ? state.context.error.orphanMessageId
          : state.context.errorMessageId,
      attachmentError,
      isPreparingAttachments,
      setDraft: (draft) => send({ type: "draft.changed", value: draft }),
      addFiles: async (files) => {
        setAttachmentError(null);
        setIsPreparingAttachments(true);
        try {
          const prepared = await prepareAttachments({
            files,
            existingCount: stateRef.current.context.files.length,
          });
          const additions = await convertFileListToFileUIParts(prepared);
          send({
            type: "files.changed",
            files: [...stateRef.current.context.files, ...additions],
          });
        } catch (error) {
          setAttachmentError(error instanceof Error ? error.message : "Could not add attachment.");
        } finally {
          setIsPreparingAttachments(false);
        }
      },
      removeFile: (url) =>
        send({
          type: "files.changed",
          files: stateRef.current.context.files.filter((file) => file.url !== url),
        }),
      submit,
      revise,
      orphanMessageId:
        state.context.error instanceof OrphanTurnError
          ? state.context.error.orphanMessageId
          : undefined,
      retryOrphan,
      stop: () => {
        recordClientEvent("client.stopped");
        abortControllerRef.current?.abort();
        cancelStreamRef.current?.();
      },
      clearError: () => send({ type: "error.cleared" }),
    };
  }, [
    attachmentError,
    config.initialMessages,
    config.sessionId,
    isPreparingAttachments,
    recordClientEvent,
    retryOrphan,
    revise,
    send,
    state,
    submit,
  ]);

  return <ChatRuntimeContext.Provider value={value}>{children}</ChatRuntimeContext.Provider>;
};
