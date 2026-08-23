"use client";

import type { FileUIPart } from "ai";
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
import type { ChatUiMessage } from "@emi/core/chat";
import { ChatProvider } from "@emi/core/react";
import type { Attachment, ChatMessage } from "@emi/core/protocol";
import type { Note } from "@emi/core/contract";
import {
  attachmentPreparationMachine,
  createBrowserChatDefaults,
  createWindowFollowUpQueueSyncAdapter,
  toAttachment as coreToAttachment,
  toFilePart as coreToFilePart,
  toUiMessage as coreToUiMessage,
  toUiMessages as coreToUiMessages,
  createDefaultChatErrorDecoder,
} from "@emi/core/web";
import { buildNotesContext } from "../notes";
import { useSettings } from "../settings-store";
import { effectiveTokenBudget } from "../usage-context";
import { queryKeys } from "../query-cache";
import { fetchConversationMessages, type ConversationSnapshot } from "../conversations";
import { createConversation } from "../sessions";
import {
  createHealthFitConversationClient,
  extractHealthFitAssistantMemories,
} from "./healthfit-chat-adapter";
import {
  ChatRuntimeContext,
  type ChatRuntimeConfig,
  type ChatRuntimeValue,
  type QueuedFollowUp,
} from "./chat-runtime-context";

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
  files: attachments.map(coreToFilePart),
});

const decodeTransportError = createDefaultChatErrorDecoder();

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
  queueSyncAdapter: ReturnType<typeof createWindowFollowUpQueueSyncAdapter>;
}) => {
  const browserDefaults = createBrowserChatDefaults({
    draftsStorage: window.localStorage,
    navigator: window.navigator,
    eventTarget: window,
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
  });
  return createChatRuntime({
    transport: {
      baseUrl: "/api",
      fetch: window.fetch.bind(window),
      createConversation,
      streamDecoder: aiSdkChatStreamDecoder,
      errorDecoder: decodeTransportError,
      messageEncoder: ({ messages }) => coreToUiMessages({ messages: messages.slice(-1) }),
      requestBody: ({ settings: coreSettings, conversationId }) => {
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
          tokenBudget: effectiveTokenBudget({
            conversationId,
            defaultBudget: currentSettings.tokenBudget,
          }),
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
      drafts: browserDefaults.storage.drafts,
    },
    browser: browserDefaults.browser,
    identity: browserDefaults.identity,
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
  const queryClient = useQueryClient();
  const configRef = useRef(config);
  const onSessionCreatedRef = useRef(onSessionCreated);
  const onHistoryChangedRef = useRef(onHistoryChanged);

  const persistence = useMemo(() => createHealthFitConversationClient(), []);
  const queueSyncAdapter = useMemo(
    () =>
      createWindowFollowUpQueueSyncAdapter({
        target: window,
        BroadcastChannel: typeof BroadcastChannel === "undefined" ? undefined : BroadcastChannel,
        createTabId: () => crypto.randomUUID(),
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
            .map(coreToAttachment),
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
    ? state.activeThread.messages.map(coreToUiMessage)
    : config.initialMessages;
  const sessionId = selectionMatches ? state.activeThread.conversationId : config.sessionId;

  const editingQueuedId = selectionMatches ? (state.ui.editingQueuedFollowUpId ?? null) : null;

  const submit = useCallback(
    async (text?: string, options?: { interrupt?: boolean }) => {
      const nextText = text ?? state.composer.text;
      if (editingQueuedId !== null) {
        runtime.actions.commitQueuedFollowUpEdit({
          id: editingQueuedId,
          text: nextText,
          attachments: state.composer.attachments,
        });
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
    (id: string) => runtime.actions.beginQueuedFollowUpEditWithDraft({ id }),
    [runtime],
  );

  const clearQueuedFollowUpEdit = useCallback(
    () => runtime.actions.discardQueuedFollowUpEdit(),
    [runtime],
  );

  const error = useMemo(() => {
    if (state.error === undefined || state.error === "") return null;
    return new Error(state.error);
  }, [state.error]);
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
      files: selectionMatches ? state.composer.attachments.map(coreToFilePart) : [],
      queuedFollowUps: selectionMatches ? queuedFollowUps : [],
      editingQueuedId: selectionMatches ? editingQueuedId : null,
      isStreaming: selectionMatches && state.activeThread.isStreaming,
      isSending: selectionMatches && state.activeThread.isSending,
      isSendGraceActive: selectionMatches && state.activeThread.isSendGraceActive,
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
