"use client";

import type { FileUIPart, UIMessage } from "ai";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createChatRuntime } from "@emi/core";
import { Chat } from "@emi/core/chat";
import type { Attachment, ChatMessage } from "@emi/core/protocol";
import { prepareAttachmentParts } from "@emi/core/web";
import { buildNotesContext } from "../notes";
import { useNotes } from "../notes-context";
import { useSettings } from "../settings-store";
import { fetchConversationMessages, type ConversationSnapshot } from "../conversations";
import { createConversation } from "../sessions";
import { createHealthFitConversationClient } from "./healthfit-chat-adapter";
import { healthFitChatStreamDecoder } from "./healthfit-chat-stream-adapter";
import {
  GenerationAlreadyRunningError,
  OrphanTurnError,
  parseChatConflictError,
} from "./orphan-turn-error";
import {
  ChatRuntimeContext,
  type ChatRuntimeConfig,
  type ChatRuntimeValue,
  type QueuedFollowUp,
} from "./chat-runtime-context";
import { useFollowUpQueueSync } from "./use-follow-up-queue-sync";

const toUiMessage = (message: ChatMessage): UIMessage =>
  Chat.messages.fromProtocolMessage({
    id: message.id,
    role: message.role,
    parts: message.parts,
  });

const toAttachment = (file: FileUIPart): Attachment => ({
  id: `attachment:${file.url}`,
  name: file.filename ?? "Attachment",
  mediaType: file.mediaType,
  url: file.url,
});

const toFilePart = (file: Attachment): FileUIPart => ({
  type: "file",
  filename: file.name,
  mediaType: file.mediaType,
  url: file.url,
});

const toQueuedFollowUp = ({
  id,
  text,
  attachments,
}: {
  id: string;
  text: string;
  attachments: ReadonlyArray<Attachment>;
}): QueuedFollowUp => ({
  id,
  text,
  files: attachments.map(toFilePart),
});

const toCoreMessages = ({ messages }: { messages: ReadonlyArray<ChatMessage> }) =>
  messages.map(toUiMessage);

const decodeTransportError = async ({
  response,
}: {
  response: Response;
}): Promise<{ message: string; messageId?: string } | undefined> => {
  const error = await parseChatConflictError(response);
  if (error instanceof OrphanTurnError) {
    return { message: error.message, messageId: error.orphanMessageId };
  }
  if (error instanceof GenerationAlreadyRunningError) return { message: error.message };
  return undefined;
};

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
  const settingsRef = useRef(settings);
  const notesRef = useRef(notes);
  const configRef = useRef(config);
  const syncedHistoryRef = useRef("");
  const notifiedSessionRef = useRef<string | undefined>(undefined);
  const ignoredConversationRef = useRef<string | undefined>(undefined);
  const createdConversationRef = useRef<string | undefined>(undefined);
  const requestedSessionRef = useRef<string | null | undefined>(undefined);
  const previousSessionIdRef = useRef(config.sessionId);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isPreparingAttachments, setIsPreparingAttachments] = useState(false);
  const [editingQueuedId, setEditingQueuedId] = useState<string | null>(null);

  settingsRef.current = settings;
  notesRef.current = notes;
  configRef.current = config;

  const persistence = useMemo(() => createHealthFitConversationClient(), []);
  const runtime = useMemo(
    () =>
      createChatRuntime({
        transport: {
          baseUrl: "/api",
          fetch: window.fetch.bind(window),
          createConversation,
          streamDecoder: healthFitChatStreamDecoder,
          errorDecoder: decodeTransportError,
          messageEncoder: ({ messages }) => toCoreMessages({ messages: messages.slice(-1) }),
          requestBody: ({ settings: coreSettings }) => {
            const currentSettings = settingsRef.current;
            const currentConfig = configRef.current;
            const notesContext = buildNotesContext(notesRef.current);
            return {
              system:
                notesContext === ""
                  ? currentSettings.systemPrompt
                  : `${currentSettings.systemPrompt}\n\n${notesContext}`,
              config: {
                provider: currentSettings.provider,
                apiKey: currentSettings.apiKey,
                baseUrl: currentSettings.baseUrl || undefined,
                model: currentConfig.model || coreSettings.model,
              },
              coachMode: currentConfig.coachMode,
              webSearch: currentConfig.webSearch,
            };
          },
        },
        persistence,
        storage: {
          settings: {
            get: () => null,
            set: () => undefined,
            remove: () => undefined,
          },
          drafts: {
            get: (key) => window.localStorage.getItem(key),
            set: (key, value) => window.localStorage.setItem(key, value),
            remove: (key) => window.localStorage.removeItem(key),
          },
        },
        browser: {
          online: navigator.onLine,
          subscribeOnline: (listener) => {
            const update = () => listener(navigator.onLine);
            window.addEventListener("online", update);
            window.addEventListener("offline", update);
            return () => {
              window.removeEventListener("online", update);
              window.removeEventListener("offline", update);
            };
          },
        },
        identity: {
          createId: () => crypto.randomUUID(),
          now: () => new Date().toISOString(),
        },
        settings: {
          defaults: {
            provider: settingsRef.current.provider,
            apiKey: settingsRef.current.apiKey,
            baseUrl: settingsRef.current.baseUrl,
            model: configRef.current.model,
            systemPrompt: settingsRef.current.systemPrompt,
            titleModel: configRef.current.model,
            titlePrompt: "",
            memoryEnabled: true,
            memoryModel: configRef.current.model,
            webSearch: configRef.current.webSearch,
            theme: "light",
          },
        },
        features: {
          attachments: true,
          memories: true,
          branches: true,
          suggestions: true,
          webSearch: true,
        },
      }),
    [persistence],
  );
  const state = useSyncExternalStore(runtime.subscribe, runtime.getState, runtime.getState);

  useEffect(() => {
    runtime.start();
    return () => runtime.dispose();
  }, [runtime]);

  useEffect(() => {
    runtime.actions.updateSettings({
      patch: {
        provider: settings.provider,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: config.model,
        systemPrompt: settings.systemPrompt,
        webSearch: config.webSearch,
      },
    });
    runtime.actions.setWebSearch({ enabled: config.webSearch });
    runtime.actions.setTemporary({ temporary: config.temporary });
  }, [config.model, config.temporary, config.webSearch, runtime, settings]);

  useEffect(() => {
    if (!config.historyReady) return;
    if (
      createdConversationRef.current !== undefined &&
      createdConversationRef.current === config.sessionId
    ) {
      createdConversationRef.current = undefined;
      return;
    }
    const previousSessionId = previousSessionIdRef.current;
    previousSessionIdRef.current = config.sessionId;
    const enteringNewRoute = previousSessionId !== undefined && config.sessionId === undefined;
    if (enteringNewRoute) {
      ignoredConversationRef.current = state.activeThread.conversationId;
    } else if (
      config.sessionId === undefined &&
      (state.activeThread.isStreaming || state.activeThread.messages.length > 0)
    ) {
      return;
    }
    if (
      !config.temporary &&
      config.sessionId !== undefined &&
      state.activeThread.conversationId === config.sessionId
    ) {
      const threadId = config.threadId;
      if (threadId !== undefined && state.activeThread.id !== threadId)
        runtime.actions.selectThread({ threadId });
      return;
    }
    const requestedSession = config.sessionId ?? null;
    if (requestedSessionRef.current === requestedSession) return;
    requestedSessionRef.current = requestedSession;
    runtime.actions.startNewConversation();
    if (config.sessionId !== undefined) {
      runtime.actions.selectConversation({ conversationId: config.sessionId });
    }
  }, [
    config.historyReady,
    config.sessionId,
    config.temporary,
    config.threadId,
    runtime,
    state.activeThread.conversationId,
    state.activeThread.id,
    state.activeThread.isStreaming,
    state.activeThread.messages.length,
  ]);

  const selectionMatches = config.temporary
    ? state.temporary
    : state.activeThread.conversationId === config.sessionId;
  const messages = selectionMatches
    ? state.activeThread.messages.map(toUiMessage)
    : config.initialMessages;
  const sessionId = selectionMatches ? state.activeThread.conversationId : config.sessionId;
  const messageSignature = `${sessionId ?? "new"}:${messages.map((message) => `${message.id}:${message.parts.length}`).join(",")}`;

  useEffect(() => {
    const conversationId = state.activeThread.conversationId;
    if (conversationId === undefined) return;
    if (ignoredConversationRef.current === conversationId) return;
    if (config.sessionId === undefined && notifiedSessionRef.current !== conversationId) {
      notifiedSessionRef.current = conversationId;
      ignoredConversationRef.current = undefined;
      createdConversationRef.current = conversationId;
      onSessionCreated?.(conversationId);
    }
  }, [config.sessionId, onSessionCreated, state.activeThread.conversationId]);

  useEffect(() => {
    const conversationId = state.activeThread.conversationId;
    if (conversationId === undefined || state.activeThread.isStreaming) return;
    const historyKey = `${conversationId}:${messageSignature}`;
    if (syncedHistoryRef.current === historyKey) return;
    syncedHistoryRef.current = historyKey;
    void fetchConversationMessages(conversationId)
      .then((snapshot) => onHistoryChanged?.(snapshot))
      .catch(() => undefined);
  }, [messageSignature, onHistoryChanged, state.activeThread]);

  const clearAttachments = useCallback(() => {
    for (const attachment of state.composer.attachments)
      runtime.actions.removeAttachment({ attachmentId: `attachment:${attachment.url}` });
  }, [runtime, state.composer.attachments]);

  const submit = useCallback(
    async (text?: string, options?: { interrupt?: boolean }) => {
      const nextText = text ?? state.composer.text;
      if (editingQueuedId !== null) {
        const queuedFollowUp = state.queuedFollowUps.find((item) => item.id === editingQueuedId);
        if (queuedFollowUp !== undefined) {
          runtime.actions.updateQueuedFollowUp({
            id: editingQueuedId,
            text: nextText,
            attachments: state.composer.attachments,
          });
        }
        setEditingQueuedId(null);
        runtime.actions.setDraft({ text: "" });
        clearAttachments();
        return;
      }
      if (options?.interrupt === true) runtime.actions.stop();
      runtime.actions.sendMessage({
        text: nextText,
        ...(text === undefined ? {} : { attachments: [] }),
      });
    },
    [clearAttachments, editingQueuedId, runtime, state.composer, state.queuedFollowUps],
  );

  const revise = useCallback(
    async ({ messageId, text }: { messageId: string; text?: string }) => {
      if (text === undefined) runtime.actions.retry({ messageId });
      else runtime.actions.editMessage({ messageId, text });
    },
    [runtime],
  );

  const addFiles = useCallback(
    async (files: FileList) => {
      setAttachmentError(null);
      setIsPreparingAttachments(true);
      try {
        const parts = await prepareAttachmentParts({
          files,
          existingCount: state.composer.attachments.length,
        });
        runtime.actions.addAttachments({
          attachments: parts
            .filter((part): part is FileUIPart => part.type === "file")
            .map(toAttachment),
        });
      } catch (cause) {
        setAttachmentError(cause instanceof Error ? cause.message : "Could not add attachment.");
      } finally {
        setIsPreparingAttachments(false);
      }
    },
    [runtime, state.composer.attachments.length],
  );

  const beginEditingQueuedFollowUp = useCallback(
    (id: string) => {
      const item = state.queuedFollowUps.find((candidate) => candidate.id === id);
      if (item === undefined) return;
      clearAttachments();
      setEditingQueuedId(id);
      runtime.actions.setDraft({ text: item.text });
      runtime.actions.addAttachments({ attachments: item.attachments });
    },
    [clearAttachments, runtime, state.queuedFollowUps],
  );

  const clearQueuedFollowUpEdit = useCallback(() => {
    setEditingQueuedId(null);
    runtime.actions.setDraft({ text: "" });
    clearAttachments();
  }, [clearAttachments, runtime]);

  const error = useMemo(() => {
    if (state.errorMessageId !== undefined)
      return new OrphanTurnError({ orphanMessageId: state.errorMessageId });
    if (state.error === undefined || state.error === "") return null;
    return new Error(state.error);
  }, [state.error, state.errorMessageId]);
  const queuedFollowUps = state.queuedFollowUps.map(toQueuedFollowUp);
  const queueSessionId = config.temporary ? undefined : (sessionId ?? config.sessionId);
  const { requestForceSendAcrossTabs } = useFollowUpQueueSync({
    runtime,
    sessionId: queueSessionId,
    temporary: config.temporary,
    active: selectionMatches,
    queuedFollowUps,
    isStreaming: selectionMatches && state.activeThread.isStreaming,
  });
  const forceSendQueued = useCallback(
    async (id?: string) => {
      const targetId = id ?? queuedFollowUps[0]?.id;
      if (targetId === undefined) return;
      if (selectionMatches && state.activeThread.isStreaming) {
        runtime.actions.forceSendQueuedFollowUp({ id: targetId });
        return;
      }
      requestForceSendAcrossTabs(targetId);
    },
    [
      queuedFollowUps,
      requestForceSendAcrossTabs,
      runtime,
      selectionMatches,
      state.activeThread.isStreaming,
    ],
  );
  const value = useMemo<ChatRuntimeValue>(
    () => ({
      messages,
      sessionId,
      draft: selectionMatches ? state.composer.text : "",
      files: selectionMatches ? state.composer.attachments.map(toFilePart) : [],
      queuedFollowUps: selectionMatches ? queuedFollowUps : [],
      editingQueuedId: selectionMatches ? editingQueuedId : null,
      isStreaming: selectionMatches && state.activeThread.isStreaming,
      error,
      errorMessageId: state.errorMessageId,
      attachmentError,
      isPreparingAttachments,
      setDraft: (text) => runtime.actions.setDraft({ text }),
      addFiles,
      removeFile: (url) => runtime.actions.removeAttachment({ attachmentId: `attachment:${url}` }),
      submit,
      revise,
      orphanMessageId: state.errorMessageId,
      retryOrphan: async () => {
        if (state.errorMessageId !== undefined)
          runtime.actions.retry({ messageId: state.errorMessageId });
      },
      isRetrying: selectionMatches && state.activeThread.isStreaming,
      stop: () => runtime.actions.stop(),
      removeQueuedFollowUp: (id) => runtime.actions.removeQueuedFollowUp({ id }),
      clearQueuedFollowUps: () => {
        for (const item of state.queuedFollowUps)
          runtime.actions.removeQueuedFollowUp({ id: item.id });
        clearQueuedFollowUpEdit();
      },
      forceSendQueued,
      beginEditingQueuedFollowUp,
      clearQueuedFollowUpEdit,
      clearError: () => runtime.actions.clearError(),
    }),
    [
      addFiles,
      attachmentError,
      beginEditingQueuedFollowUp,
      clearQueuedFollowUpEdit,
      editingQueuedId,
      error,
      isPreparingAttachments,
      messages,
      forceSendQueued,
      queuedFollowUps,
      revise,
      runtime,
      selectionMatches,
      sessionId,
      state,
      submit,
    ],
  );

  return <ChatRuntimeContext.Provider value={value}>{children}</ChatRuntimeContext.Provider>;
};
