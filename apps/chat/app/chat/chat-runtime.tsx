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
import { runtimeSelectionMatches } from "./chat-runtime-selection";
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
  const [editingQueuedId, setEditingQueuedId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);
  const operationRef = useRef(0);
  const generationIdRef = useRef<string | null>(null);
  const editingQueuedIdRef = useRef<string | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    editingQueuedIdRef.current = editingQueuedId;
  }, [editingQueuedId]);

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
  const { submit, revise, retryOrphan, forceSendQueued, isRetrying } = useChatSubmission({
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
    editingQueuedIdRef,
    setEditingQueuedId,
  });

  const beginEditingQueuedFollowUp = useCallback(
    (id: string) => {
      const item = stateRef.current.context.queuedFollowUps.find((entry) => entry.id === id);
      if (item === undefined) return;
      setEditingQueuedId(id);
      send({ type: "draft.changed", value: item.text });
      send({ type: "files.changed", files: item.files });
    },
    [send],
  );

  const clearQueuedFollowUpEdit = useCallback(() => {
    setEditingQueuedId(null);
    send({ type: "draft.changed", value: "" });
    send({ type: "files.changed", files: [] });
  }, [send]);

  const value = useMemo<ChatRuntimeValue>(() => {
    const selectionMatchesRuntime = runtimeSelectionMatches({
      runtimeSessionId: state.context.sessionId,
      selectedSessionId: config.sessionId,
      temporary: config.temporary,
    });
    return {
      messages: selectionMatchesRuntime ? state.context.messages : config.initialMessages,
      sessionId: selectionMatchesRuntime ? state.context.sessionId : config.sessionId,
      draft: selectionMatchesRuntime ? state.context.draft : "",
      files: selectionMatchesRuntime ? state.context.files : [],
      queuedFollowUps: selectionMatchesRuntime ? state.context.queuedFollowUps : [],
      editingQueuedId: selectionMatchesRuntime ? editingQueuedId : null,
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
      isRetrying,
      stop: () => {
        recordClientEvent("client.stopped");
        abortControllerRef.current?.abort();
        cancelStreamRef.current?.();
      },
      removeQueuedFollowUp: (id) => {
        send({ type: "followUp.removed", id });
        if (editingQueuedIdRef.current === id) clearQueuedFollowUpEdit();
      },
      clearQueuedFollowUps: () => {
        send({ type: "followUp.cleared" });
        clearQueuedFollowUpEdit();
      },
      forceSendQueued,
      beginEditingQueuedFollowUp,
      clearQueuedFollowUpEdit,
      clearError: () => send({ type: "error.cleared" }),
    };
  }, [
    attachmentError,
    beginEditingQueuedFollowUp,
    clearQueuedFollowUpEdit,
    config.initialMessages,
    config.sessionId,
    config.temporary,
    editingQueuedId,
    forceSendQueued,
    isPreparingAttachments,
    isRetrying,
    recordClientEvent,
    retryOrphan,
    revise,
    send,
    state,
    submit,
  ]);

  return <ChatRuntimeContext.Provider value={value}>{children}</ChatRuntimeContext.Provider>;
};
