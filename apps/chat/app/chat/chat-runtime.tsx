"use client";

import { useMachine } from "@xstate/react";
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
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSettings } from "../settings-store";
import { createConversation } from "../sessions";
import { buildNotesContext } from "../notes";
import { useNotes } from "../notes-context";
import { chatRuntimeMachine } from "./chat-runtime-machine";

export interface ChatRuntimeConfig {
  model: string;
  coachMode: boolean;
  webSearch: boolean;
  temporary: boolean;
  historyReady: boolean;
  sessionId?: string;
  initialMessages: UIMessage[];
}

interface ChatRuntimeValue {
  messages: UIMessage[];
  sessionId: string | undefined;
  draft: string;
  files: import("ai").FileUIPart[];
  isStreaming: boolean;
  error: Error | null;
  setDraft: (value: string) => void;
  addFiles: (files: FileList) => Promise<void>;
  removeFile: (url: string) => void;
  submit: (text?: string) => Promise<void>;
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
  const iterator = readUIMessageStream({ stream, terminateOnError: true })[Symbol.asyncIterator]();
  const cancel = () => {
    void iterator.return?.();
  };
  cancelRef.current = cancel;
  try {
    for await (const message of { [Symbol.asyncIterator]: () => iterator }) {
      onMessage(message);
    }
  } finally {
    if (cancelRef.current === cancel) cancelRef.current = null;
  }
};

export const ChatRuntimeProvider = ({
  config,
  onSessionCreated,
  children,
}: {
  config: ChatRuntimeConfig;
  onSessionCreated?: (id: string) => void;
  children: ReactNode;
}) => {
  const settings = useSettings((state) => state.settings);
  const { notes } = useNotes();
  const queryClient = useQueryClient();
  const [state, send] = useMachine(chatRuntimeMachine, {
    input: { sessionId: config.sessionId, messages: config.initialMessages },
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);
  const historySignatureRef = useRef("");
  const resumeSessionRef = useRef<string | undefined>(undefined);
  const operationRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const transport = useMemo(() => new DefaultChatTransport<UIMessage>({ api: "/api/chat" }), []);
  const historySignature = `${config.sessionId ?? "new"}:${config.initialMessages
    .map((message) => message.id)
    .join(",")}`;

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
      send({ type: "resume.started" });
      const stream = await transport.reconnectToStream({ chatId: sessionId });
      if (stream === null) {
        if (operationRef.current === operation) send({ type: "stream.completed" });
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
      await queryClient.invalidateQueries({ queryKey: ["thread", sessionId] });
    };
    void resume().catch((error) => {
      if (stateRef.current.context.sessionId !== sessionId) return;
      send({
        type: "stream.failed",
        error: error instanceof Error ? error : new Error(String(error)),
      });
    });
  }, [config.historyReady, config.sessionId, config.temporary, queryClient, send, transport]);

  const submit = useCallback(
    async (text?: string) => {
      if (stateRef.current.matches("streaming")) return;
      const content = (text ?? stateRef.current.context.draft).trim();
      if (content === "" && stateRef.current.context.files.length === 0) return;

      let sessionId = config.sessionId ?? stateRef.current.context.sessionId;
      if (sessionId === undefined) {
        sessionId = config.temporary ? `temp_${crypto.randomUUID()}` : await createConversation();
        onSessionCreated?.(sessionId);
      }

      const userMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [
          ...(content === "" ? [] : [{ type: "text" as const, text: content }]),
          ...stateRef.current.context.files,
        ],
      };
      send({ type: "submit.started", sessionId, message: userMessage });
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
        });
      } finally {
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
      }
    },
    [
      config.coachMode,
      config.model,
      config.sessionId,
      config.temporary,
      config.webSearch,
      notes,
      onSessionCreated,
      queryClient,
      send,
      settings.apiKey,
      settings.baseUrl,
      settings.provider,
      settings.systemPrompt,
      transport,
    ],
  );

  const value = useMemo<ChatRuntimeValue>(
    () => ({
      messages: state.context.messages,
      sessionId: state.context.sessionId,
      draft: state.context.draft,
      files: state.context.files,
      isStreaming: state.matches("streaming"),
      error: state.context.error,
      setDraft: (value) => send({ type: "draft.changed", value }),
      addFiles: async (files) => {
        const additions = await convertFileListToFileUIParts(files);
        send({
          type: "files.changed",
          files: [...stateRef.current.context.files, ...additions].slice(0, 10),
        });
      },
      removeFile: (url) =>
        send({
          type: "files.changed",
          files: stateRef.current.context.files.filter((file) => file.url !== url),
        }),
      submit,
      stop: () => {
        abortControllerRef.current?.abort();
        cancelStreamRef.current?.();
      },
      clearError: () => send({ type: "error.cleared" }),
    }),
    [send, state, submit],
  );

  return <ChatRuntimeContext.Provider value={value}>{children}</ChatRuntimeContext.Provider>;
};

export const useChatRuntime = (): ChatRuntimeValue => {
  const context = useContext(ChatRuntimeContext);
  if (context === null) throw new Error("useChatRuntime must be used within ChatRuntimeProvider");
  return context;
};
