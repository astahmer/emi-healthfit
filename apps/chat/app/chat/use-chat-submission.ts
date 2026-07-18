import type { UIMessage } from "ai";
import { useCallback, type MutableRefObject } from "react";
import { type EventFrom, type SnapshotFrom } from "xstate";
import { runApi } from "../api-client";
import { notifyConversationsChanged } from "../conversation-events";
import type { ConversationSnapshot } from "../conversations";
import { extractMemories } from "../memories";
import { notifyMemoriesChanged } from "../memory-events";
import { buildNotesContext } from "../notes";
import { type useNotes } from "../notes-context";
import { createConversation } from "../sessions";
import { type useSettings } from "../settings-store";
import { chatRuntimeMachine } from "./chat-runtime-machine";
import type { ChatRuntimeConfig } from "./chat-runtime-context";
import { consumeAssistantStream, type ChatTransport } from "./chat-transport";
import { OrphanTurnError } from "./orphan-turn-error";

type ChatRuntimeSnapshot = SnapshotFrom<typeof chatRuntimeMachine>;
type ChatRuntimeEvent = EventFrom<typeof chatRuntimeMachine>;
type ChatSettings = ReturnType<typeof useSettings.getState>["settings"];
type Notes = ReturnType<typeof useNotes>["notes"];

export const useChatSubmission = ({
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
}: {
  config: ChatRuntimeConfig;
  settings: ChatSettings;
  notes: Notes;
  stateRef: MutableRefObject<ChatRuntimeSnapshot>;
  send: (event: ChatRuntimeEvent) => void;
  operationRef: MutableRefObject<number>;
  abortControllerRef: MutableRefObject<AbortController | null>;
  cancelStreamRef: MutableRefObject<(() => void) | null>;
  transport: ChatTransport;
  synchronizePersistedHistory: (sessionId: string) => Promise<ConversationSnapshot>;
  onSessionCreated?: (id: string) => void;
  recordClientEvent: (type: "client.disconnected" | "client.retried") => void;
}) => {
  const autoSaveAssistantMemories = useCallback(
    async ({ sessionId, snapshot }: { sessionId: string; snapshot: ConversationSnapshot }) => {
      if (config.temporary) return;
      const assistant = snapshot.messages.findLast((message) => message.role === "assistant");
      if (assistant === undefined) return;
      const text = assistant.parts
        .filter(
          (part): part is { type: "text"; text: string } =>
            part.type === "text" && typeof part.text === "string",
        )
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (text === "") return;
      const ids = await extractMemories({
        text,
        threadId: sessionId,
        messageId: assistant.id,
        source: "auto",
        config: {
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl || undefined,
          model: config.model,
        },
      });
      if (ids.length > 0) notifyMemoriesChanged();
    },
    [config.model, config.temporary, settings.apiKey, settings.baseUrl],
  );

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
      let shouldNavigateToCreatedSession = false;
      if (sessionId === undefined) {
        sessionId = config.temporary ? `temp_${crypto.randomUUID()}` : await createConversation();
        shouldNavigateToCreatedSession = !config.temporary;
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
        if (shouldNavigateToCreatedSession) {
          onSessionCreated?.(sessionId);
          shouldNavigateToCreatedSession = false;
        }
        await consumeAssistantStream({
          stream,
          onMessage: (message) => {
            if (operationRef.current === operation) send({ type: "stream.updated", message });
          },
          cancelRef: cancelStreamRef,
        });
        if (operationRef.current !== operation) return;
        send({ type: "stream.completed" });
        const snapshot = await synchronizePersistedHistory(sessionId);
        notifyConversationsChanged();
        void autoSaveAssistantMemories({ sessionId, snapshot }).catch(() => undefined);
      } catch (error) {
        if (shouldNavigateToCreatedSession) onSessionCreated?.(sessionId);
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
      abortControllerRef,
      autoSaveAssistantMemories,
      cancelStreamRef,
      config.coachMode,
      config.model,
      config.sessionId,
      config.temporary,
      config.threadId,
      config.webSearch,
      notes,
      onSessionCreated,
      operationRef,
      recordClientEvent,
      send,
      settings.apiKey,
      settings.baseUrl,
      settings.provider,
      settings.systemPrompt,
      stateRef,
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
    [
      config.sessionId,
      config.temporary,
      config.threadId,
      recordClientEvent,
      send,
      stateRef,
      submitMessage,
    ],
  );

  const retryOrphan = useCallback(async () => {
    const error = stateRef.current.context.error;
    if (!(error instanceof OrphanTurnError)) return;
    await revise({ messageId: error.orphanMessageId });
  }, [revise, stateRef]);

  return { submit, revise, retryOrphan };
};
