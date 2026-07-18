"use client";

import { useMachine } from "@xstate/react";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import {
  DefaultChatTransport,
  convertFileListToFileUIParts,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSettings } from "../settings-store";
import { createConversation } from "../sessions";
import { fetchConversationMessages, type ConversationSnapshot } from "../conversations";
import { buildNotesContext } from "../notes";
import { useNotes } from "../notes-context";
import { getConversationViewMessages } from "./conversation-tree";
import { OrphanTurnError, parseOrphanTurnError } from "./orphan-turn-error";
import { chatRuntimeMachine } from "./chat-runtime-machine";
import { prepareAttachments } from "./attachments";
import { runApi } from "../api-client";

export interface ChatRuntimeConfig {
  model: string;
  coachMode: boolean;
  webSearch: boolean;
  temporary: boolean;
  historyReady: boolean;
  sessionId?: string;
  threadId?: string;
  initialMessages: UIMessage[];
}

interface ChatRuntimeValue {
  messages: UIMessage[];
  sessionId: string | undefined;
  draft: string;
  files: import("ai").FileUIPart[];
  isStreaming: boolean;
  error: Error | null;
  errorMessageId: string | undefined;
  attachmentError: string | null;
  isPreparingAttachments: boolean;
  setDraft: (value: string) => void;
  addFiles: (files: FileList) => Promise<void>;
  removeFile: (url: string) => void;
  submit: (text?: string) => Promise<void>;
  revise: (options: { messageId: string; text?: string }) => Promise<void>;
  orphanMessageId: string | undefined;
  retryOrphan: () => Promise<void>;
  stop: () => void;
  clearError: () => void;
}

const ChatRuntimeContext = createContext<ChatRuntimeValue | null>(null);

const consumeAssistantStream = async ({
  stream,
  onMessage,
  cancelRef,
}: {
  stream: ReadableStream<UIMessageChunk>;
  onMessage: (message: UIMessage) => void;
  cancelRef: { current: (() => void) | null };
}): Promise<void> => {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const streamStartedAt = performance.now();
  let previousChunkAt = streamStartedAt;
  let chunkCount = 0;
  cancelRef.current = cancel;
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
  } finally {
    if (cancelRef.current === cancel) cancelRef.current = null;
  }
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
  const queryClient = useQueryClient();
  const [state, send] = useMachine(chatRuntimeMachine, {
    input: { sessionId: config.sessionId, messages: config.initialMessages },
  });
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isPreparingAttachments, setIsPreparingAttachments] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);
  const historySignatureRef = useRef("");
  const resumeSessionRef = useRef<string | undefined>(undefined);
  const operationRef = useRef(0);
  const generationIdRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          const orphanTurnError = await parseOrphanTurnError(response);
          if (orphanTurnError !== undefined) throw orphanTurnError;
          const generationId = response.headers.get("x-generation-id");
          const conversationId = response.headers.get("x-thread-id");
          if (!config.temporary && generationId !== null && conversationId !== null) {
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
    [config.temporary],
  );
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
    },
    [config.threadId, onHistoryChanged, send],
  );

  const recordClientEvent = useCallback(
    (type: "client.disconnected" | "client.stopped" | "client.retried") => {
      const conversationId = stateRef.current.context.sessionId;
      const generationId = generationIdRef.current;
      if (config.temporary || conversationId === undefined || generationId === null) return;
      void recordDiagnosticEvent({ conversationId, generationId, type });
    },
    [config.temporary],
  );

  useEffect(() => {
    if (historySignatureRef.current === historySignature) return;
    historySignatureRef.current = historySignature;
    if (
      stateRef.current.matches("streaming") &&
      stateRef.current.context.sessionId === config.sessionId
    ) {
      return;
    }
    operationRef.current += 1;
    abortControllerRef.current?.abort();
    cancelStreamRef.current?.();
    send({
      type: "history.changed",
      sessionId: config.sessionId,
      messages: config.initialMessages,
    });
  }, [config.initialMessages, config.sessionId, historySignature, send]);

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
      send({
        type: "history.changed",
        sessionId,
        messages: config.initialMessages,
      });
      send({ type: "resume.started" });
      const stream = await transport.reconnectToStream({ chatId: sessionId });
      if (stream === null) {
        if (operationRef.current === operation) send({ type: "stream.completed" });
        await synchronizePersistedHistory(sessionId);
        await queryClient.invalidateQueries({ queryKey: ["thread", sessionId] });
        return;
      }
      await consumeAssistantStream({
        stream,
        onMessage: (message) => {
          if (operationRef.current === operation) {
            send({ type: "stream.updated", message });
          }
        },
        cancelRef: cancelStreamRef,
      });
      if (operationRef.current !== operation) return;
      send({ type: "stream.completed" });
      await synchronizePersistedHistory(sessionId);
      await queryClient.invalidateQueries({ queryKey: ["thread", sessionId] });
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
    config.initialMessages,
    config.historyReady,
    config.sessionId,
    config.temporary,
    queryClient,
    recordClientEvent,
    send,
    synchronizePersistedHistory,
    transport,
  ]);

  const submitMessage = useCallback(
    async ({
      text,
      parts,
      replaceMessageId,
    }: {
      text?: string;
      parts?: UIMessage["parts"];
      replaceMessageId?: string;
    }) => {
      if (stateRef.current.matches("streaming")) return;
      const content = (text ?? stateRef.current.context.draft).trim();
      if (parts === undefined && content === "" && stateRef.current.context.files.length === 0)
        return;

      let sessionId = config.sessionId;
      if (sessionId === undefined) {
        sessionId = config.temporary ? `temp_${crypto.randomUUID()}` : await createConversation();
        onSessionCreated?.(sessionId);
      }

      const textParts: UIMessage["parts"] = content === "" ? [] : [{ type: "text", text: content }];
      const userMessage: UIMessage = {
        id: replaceMessageId ?? crypto.randomUUID(),
        role: "user",
        parts: parts ?? [...textParts, ...stateRef.current.context.files],
      };
      send(
        replaceMessageId === undefined
          ? { type: "submit.started", sessionId, message: userMessage }
          : { type: "revision.started", sessionId, message: userMessage, replaceMessageId },
      );
      const operation = operationRef.current + 1;
      operationRef.current = operation;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const notesContext = buildNotesContext(notes);
        const system =
          notesContext === ""
            ? settings.systemPrompt
            : `${settings.systemPrompt}\n\n${notesContext}`;
        const stream = await transport.sendMessages({
          trigger: "submit-message",
          chatId: sessionId,
          messageId: userMessage.id,
          messages: [userMessage],
          abortSignal: controller.signal,
          body: {
            messages: [userMessage],
            system,
            config: {
              provider: settings.provider,
              apiKey: settings.apiKey,
              baseUrl: settings.baseUrl || undefined,
              model: config.model,
            },
            coachMode: config.coachMode,
            webSearch: config.webSearch,
            temporary: config.temporary,
            sessionId,
            threadId: config.threadId,
            replaceMessageId,
          },
        });
        await consumeAssistantStream({
          stream,
          onMessage: (message) => {
            if (operationRef.current === operation) {
              send({ type: "stream.updated", message });
            }
          },
          cancelRef: cancelStreamRef,
        });
        if (operationRef.current !== operation) return;
        send({ type: "stream.completed" });
        await synchronizePersistedHistory(sessionId);
        await queryClient.invalidateQueries({ queryKey: ["thread", sessionId] });
        await queryClient.invalidateQueries({ queryKey: ["threads"] });
      } catch (error) {
        if (operationRef.current !== operation) return;
        if (controller.signal.aborted) {
          send({ type: "stream.stopped" });
          return;
        }
        send({
          type: "stream.failed",
          error: error instanceof Error ? error : new Error(String(error)),
          messageId: userMessage.id,
        });
        recordClientEvent("client.disconnected");
      } finally {
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
      }
    },
    [
      config.coachMode,
      config.model,
      config.sessionId,
      config.temporary,
      config.threadId,
      config.webSearch,
      notes,
      onSessionCreated,
      queryClient,
      recordClientEvent,
      send,
      settings.apiKey,
      settings.baseUrl,
      settings.provider,
      settings.systemPrompt,
      synchronizePersistedHistory,
      transport,
    ],
  );

  const submit = useCallback((text?: string) => submitMessage({ text }), [submitMessage]);

  const revise = useCallback(
    async ({ messageId, text }: { messageId: string; text?: string }) => {
      const messages = stateRef.current.context.messages;
      const selectedIndex = messages.findIndex((message) => message.id === messageId);
      const userMessage = messages
        .slice(0, selectedIndex + 1)
        .findLast((message) => message.role === "user");
      const sessionId = config.sessionId;
      if (userMessage === undefined || sessionId === undefined || config.temporary) return;

      const parts: UIMessage["parts"] =
        text === undefined
          ? userMessage.parts
          : [
              { type: "text", text: text.trim() },
              ...userMessage.parts.filter((part) => part.type === "file"),
            ];
      try {
        await runApi((client) =>
          client.conversations.reviseMessage({
            params: { id: sessionId, messageId: userMessage.id },
            payload: { parts, threadId: config.threadId },
          }),
        );
        recordClientEvent("client.retried");
        await submitMessage({ parts, replaceMessageId: userMessage.id });
      } catch (error) {
        send({
          type: "stream.failed",
          error: error instanceof Error ? error : new Error(String(error)),
          messageId: userMessage.id,
        });
      }
    },
    [config.sessionId, config.temporary, config.threadId, recordClientEvent, send, submitMessage],
  );

  const retryOrphan = useCallback(async () => {
    const error = stateRef.current.context.error;
    if (!(error instanceof OrphanTurnError)) return;
    await revise({ messageId: error.orphanMessageId });
  }, [revise]);

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
      setDraft: (value) => send({ type: "draft.changed", value }),
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
    revise,
    recordClientEvent,
    retryOrphan,
    send,
    state,
    submit,
  ]);

  return <ChatRuntimeContext.Provider value={value}>{children}</ChatRuntimeContext.Provider>;
};

export const useChatRuntime = (): ChatRuntimeValue => {
  const context = useContext(ChatRuntimeContext);
  if (context === null) throw new Error("useChatRuntime must be used within ChatRuntimeProvider");
  return context;
};
type DiagnosticEventType =
  | "client.submitted"
  | "client.disconnected"
  | "client.reconnected"
  | "client.stopped"
  | "client.refreshed"
  | "client.retried";

const recordDiagnosticEvent = ({
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
