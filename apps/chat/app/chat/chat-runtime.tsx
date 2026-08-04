"use client";

import type { FileUIPart, UIMessage } from "ai";
import { useActor } from "@xstate/react";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createChatRuntime } from "@emi/core";
import { aiSdkChatStreamDecoder } from "@emi/core/adapters/ai-sdk";
import { Chat } from "@emi/core/chat";
import { ChatProvider } from "@emi/core/react";
import type { Attachment, ChatMessage } from "@emi/core/protocol";
import type { Note } from "@emi/core/contract";
import { attachmentPreparationMachine, createBrowserFollowUpQueueSyncAdapter } from "@emi/core/web";
import { buildNotesContext } from "../notes";
import { useSettings } from "../settings-store";
import { queryKeys } from "../query-cache";
import { fetchConversationMessages, type ConversationSnapshot } from "../conversations";
import { createConversation } from "../sessions";
import {
  createHealthFitConversationClient,
  extractHealthFitAssistantMemories,
} from "./healthfit-chat-adapter";
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

const toUiMessages = ({ messages }: { messages: ReadonlyArray<ChatMessage> }) =>
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

type MutableRef<Value> = { current: Value };

const createHealthFitChatRuntime = ({
  configRef,
  onSessionCreatedRef,
  onHistoryChangedRef,
  persistence,
  queryClient,
  queueSyncAdapter,
}: {
  configRef: MutableRef<ChatRuntimeConfig>;
  onSessionCreatedRef: MutableRef<((id: string) => void) | undefined>;
  onHistoryChangedRef: MutableRef<((snapshot: ConversationSnapshot) => void) | undefined>;
  persistence: ReturnType<typeof createHealthFitConversationClient>;
  queryClient: QueryClient;
  queueSyncAdapter: ReturnType<typeof createBrowserFollowUpQueueSyncAdapter>;
}) =>
  createChatRuntime({
    transport: {
      baseUrl: "/api",
      fetch: window.fetch.bind(window),
      createConversation,
      streamDecoder: aiSdkChatStreamDecoder,
      errorDecoder: decodeTransportError,
      messageEncoder: ({ messages }) => toUiMessages({ messages: messages.slice(-1) }),
      requestBody: ({ settings: coreSettings }) => {
        const currentSettings = useSettings.getState().settings;
        const currentConfig = configRef.current;
        const notesContext = buildNotesContext(
          queryClient.getQueryData<Note[]>(queryKeys.notes.list({ search: "" })) ?? [],
        );
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
    queueSync: {
      adapter: queueSyncAdapter,
    },
    lifecycle: {
      onSessionCreated: ({ conversationId }) => onSessionCreatedRef.current?.(conversationId),
      onHistoryChanged: ({ conversationId, signal }) =>
        fetchConversationMessages(conversationId, signal).then((snapshot) =>
          signal.aborted ? undefined : onHistoryChangedRef.current?.(snapshot),
        ),
      onStreamCompleted: ({ conversationId, message, temporary }) =>
        extractHealthFitAssistantMemories({
          conversationId,
          message,
          temporary,
          apiKey: useSettings.getState().settings.apiKey,
          baseUrl: useSettings.getState().settings.baseUrl,
          model: configRef.current.model,
        }),
    },
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
        provider: useSettings.getState().settings.provider,
        apiKey: useSettings.getState().settings.apiKey,
        baseUrl: useSettings.getState().settings.baseUrl,
        model: configRef.current.model,
        systemPrompt: useSettings.getState().settings.systemPrompt,
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
  });

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
  const queryClient = useQueryClient();
  const configRef = useRef(config);
  const onSessionCreatedRef = useRef(onSessionCreated);
  const onHistoryChangedRef = useRef(onHistoryChanged);

  const persistence = useMemo(() => createHealthFitConversationClient(), []);
  const queueSyncAdapter = useMemo(
    () =>
      createBrowserFollowUpQueueSyncAdapter({
        storage: window.localStorage,
        createId: () => crypto.randomUUID(),
        createChannel:
          typeof BroadcastChannel === "undefined"
            ? undefined
            : (name) => new BroadcastChannel(name),
        subscribeStorage: (listener) => {
          const onStorage = (event: StorageEvent) => listener(event);
          window.addEventListener("storage", onStorage);
          return () => window.removeEventListener("storage", onStorage);
        },
      }),
    [],
  );
  const runtime = useMemo(
    () =>
      createHealthFitChatRuntime({
        configRef,
        onSessionCreatedRef,
        onHistoryChangedRef,
        persistence,
        queryClient,
        queueSyncAdapter,
      }),
    [persistence, queryClient, queueSyncAdapter],
  );
  const state = useSyncExternalStore(runtime.subscribe, runtime.getState, runtime.getState);
  const [attachmentState, sendAttachment] = useActor(attachmentPreparationMachine, {
    input: {
      onPrepared: (parts) =>
        runtime.actions.addAttachments({
          attachments: parts
            .filter((part): part is FileUIPart => part.type === "file")
            .map(toAttachment),
        }),
    },
  });

  useLayoutEffect(() => {
    configRef.current = config;
    onSessionCreatedRef.current = onSessionCreated;
    onHistoryChangedRef.current = onHistoryChanged;
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
    runtime.actions.syncRoute({
      historyReady: config.historyReady,
      sessionId: config.sessionId,
      threadId: config.threadId,
      temporary: config.temporary,
    });
  }, [
    config.historyReady,
    config.sessionId,
    config.temporary,
    config.threadId,
    config.webSearch,
    config.model,
    runtime,
    settings,
    config,
    onSessionCreated,
    onHistoryChanged,
  ]);

  const selectionMatches = config.temporary
    ? state.temporary
    : state.activeThread.conversationId === config.sessionId;
  const messages = selectionMatches
    ? state.activeThread.messages.map(toUiMessage)
    : config.initialMessages;
  const sessionId = selectionMatches ? state.activeThread.conversationId : config.sessionId;

  const clearAttachments = useCallback(() => {
    for (const attachment of state.composer.attachments)
      runtime.actions.removeAttachment({ attachmentId: `attachment:${attachment.url}` });
  }, [runtime, state.composer.attachments]);
  const editingQueuedId = selectionMatches ? (state.ui.editingQueuedFollowUpId ?? null) : null;

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
        runtime.actions.clearQueuedFollowUpEdit();
        runtime.actions.setDraft({ text: "" });
        clearAttachments();
        return;
      }
      if (!selectionMatches) {
        if (config.sessionId !== undefined) return;
        runtime.actions.setTemporary({ temporary: config.temporary });
        runtime.actions.startNewConversation();
      }
      if (options?.interrupt === true) runtime.actions.stop();
      runtime.actions.sendMessage({
        text: nextText,
        ...(text === undefined ? {} : { attachments: [] }),
      });
    },
    [
      clearAttachments,
      config.sessionId,
      config.temporary,
      editingQueuedId,
      runtime,
      selectionMatches,
      state.composer,
      state.queuedFollowUps,
    ],
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
      sendAttachment({
        type: "files.selected",
        files,
        existingCount: state.composer.attachments.length,
      });
    },
    [sendAttachment, state.composer.attachments.length],
  );

  const beginEditingQueuedFollowUp = useCallback(
    (id: string) => {
      const item = state.queuedFollowUps.find((candidate) => candidate.id === id);
      if (item === undefined) return;
      clearAttachments();
      runtime.actions.beginEditingQueuedFollowUp({ id });
      runtime.actions.setDraft({ text: item.text });
      runtime.actions.addAttachments({ attachments: item.attachments });
    },
    [clearAttachments, runtime, state.queuedFollowUps],
  );

  const clearQueuedFollowUpEdit = useCallback(() => {
    runtime.actions.clearQueuedFollowUpEdit();
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
  const forceSendQueued = useCallback(
    async (id?: string) => {
      const targetId = id ?? queuedFollowUps[0]?.id;
      if (targetId === undefined) return;
      runtime.actions.forceSendQueuedFollowUp({ id: targetId });
    },
    [queuedFollowUps, runtime],
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
      attachmentError: attachmentState.context.error,
      isPreparingAttachments: attachmentState.matches("preparing"),
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
      beginEditingQueuedFollowUp,
      clearQueuedFollowUpEdit,
      editingQueuedId,
      error,
      attachmentState,
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

  return (
    <ChatProvider runtime={runtime}>
      <ChatRuntimeContext.Provider value={value}>{children}</ChatRuntimeContext.Provider>
    </ChatProvider>
  );
};
