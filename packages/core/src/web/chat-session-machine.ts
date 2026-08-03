import { assign, setup } from "xstate";
import type { ChatMessage } from "../protocol/messages.ts";
import type { Attachment } from "../protocol/parts.ts";

export interface QueuedFollowUp {
  id: string;
  text: string;
  files: Attachment[];
}

export interface ChatSession {
  conversationId: string | undefined;
  threadId: string | undefined;
  messages: ChatMessage[];
  draft: string;
  files: Attachment[];
  temporary: boolean;
  error: string | undefined;
  errorMessageId: string | undefined;
  queuedFollowUps: QueuedFollowUp[];
}

export type ChatSessionEvent =
  | { type: "draft-changed"; draft: string }
  | { type: "files-changed"; files: Attachment[] }
  | { type: "files-added"; files: Attachment[] }
  | { type: "temporary-changed"; temporary: boolean }
  | { type: "fresh-started" }
  | { type: "conversation-opened"; conversationId: string; messages: ChatMessage[] }
  | { type: "thread-opened"; threadId: string; messages: ChatMessage[] }
  | { type: "conversation-identified"; conversationId: string }
  | { type: "stream-started"; messages: ChatMessage[] }
  | { type: "stream-resumed" }
  | { type: "stream-message"; message: ChatMessage }
  | { type: "stream-finished" }
  | { type: "error-reported"; error: string; messageId?: string }
  | { type: "error-cleared" }
  | { type: "follow-up-queued"; followUp: QueuedFollowUp }
  | { type: "queued-follow-up-forced"; id: string }
  | { type: "queued-follow-up-updated"; id: string; text: string; files: Attachment[] }
  | { type: "queued-follow-up-removed"; id: string }
  | { type: "queued-follow-ups-replaced"; items: QueuedFollowUp[] };

export const initialChatSession: ChatSession = {
  conversationId: undefined,
  threadId: undefined,
  messages: [],
  draft: "",
  files: [],
  temporary: false,
  error: undefined,
  errorMessageId: undefined,
  queuedFollowUps: [],
};

const replaceMessage = ({
  messages,
  message,
}: {
  messages: ChatMessage[];
  message: ChatMessage;
}): ChatMessage[] => {
  const index = messages.findIndex((candidate) => candidate.id === message.id);
  if (index === -1) return [...messages, message];
  return [...messages.slice(0, index), message, ...messages.slice(index + 1)];
};

export const chatSessionMachine = setup({
  types: {
    context: {} as ChatSession,
    events: {} as ChatSessionEvent,
  },
  actions: {
    changeDraft: assign(({ event }) =>
      event.type === "draft-changed" ? { draft: event.draft } : {},
    ),
    changeFiles: assign(({ event }) =>
      event.type === "files-changed" ? { files: event.files } : {},
    ),
    addFiles: assign(({ context, event }) =>
      event.type === "files-added" ? { files: [...context.files, ...event.files] } : {},
    ),
    changeTemporary: assign(({ event }) =>
      event.type === "temporary-changed" ? { temporary: event.temporary } : {},
    ),
    startFresh: assign(({ context }) => ({ ...initialChatSession, temporary: context.temporary })),
    openConversation: assign(({ event }) =>
      event.type === "conversation-opened"
        ? {
            ...initialChatSession,
            conversationId: event.conversationId,
            messages: event.messages,
          }
        : {},
    ),
    openThread: assign(({ context, event }) =>
      event.type === "thread-opened"
        ? {
            ...initialChatSession,
            conversationId: context.conversationId,
            threadId: event.threadId,
            messages: event.messages,
          }
        : {},
    ),
    identifyConversation: assign(({ event }) =>
      event.type === "conversation-identified" ? { conversationId: event.conversationId } : {},
    ),
    startStream: assign(({ event }) =>
      event.type === "stream-started"
        ? {
            messages: event.messages,
            draft: "",
            files: [],
            error: undefined,
            errorMessageId: undefined,
          }
        : {},
    ),
    resumeStream: assign({ error: () => undefined }),
    updateStream: assign(({ context, event }) =>
      event.type === "stream-message"
        ? { messages: replaceMessage({ messages: context.messages, message: event.message }) }
        : {},
    ),
    reportError: assign(({ event }) =>
      event.type === "error-reported"
        ? { error: event.error, errorMessageId: event.messageId }
        : {},
    ),
    clearError: assign({ error: () => undefined, errorMessageId: () => undefined }),
    replaceQueuedFollowUps: assign(({ event }) =>
      event.type === "queued-follow-ups-replaced" ? { queuedFollowUps: event.items } : {},
    ),
    queueFollowUp: assign(({ context, event }) =>
      event.type === "follow-up-queued"
        ? {
            draft: "",
            files: [],
            queuedFollowUps: [...context.queuedFollowUps, event.followUp],
          }
        : {},
    ),
    forceQueuedFollowUp: assign(({ context, event }) => {
      if (event.type !== "queued-follow-up-forced") return {};
      const followUp = context.queuedFollowUps.find((item) => item.id === event.id);
      if (followUp === undefined) return {};
      return {
        draft: followUp.text,
        files: followUp.files,
        queuedFollowUps: context.queuedFollowUps.filter((item) => item.id !== event.id),
      };
    }),
    updateQueuedFollowUp: assign(({ context, event }) => {
      if (event.type !== "queued-follow-up-updated") return {};
      return {
        queuedFollowUps: context.queuedFollowUps.map((item) =>
          item.id === event.id ? { ...item, text: event.text, files: event.files } : item,
        ),
      };
    }),
    removeQueuedFollowUp: assign(({ context, event }) =>
      event.type === "queued-follow-up-removed"
        ? { queuedFollowUps: context.queuedFollowUps.filter((item) => item.id !== event.id) }
        : {},
    ),
  },
}).createMachine({
  id: "chatSession",
  initial: "idle",
  context: () => initialChatSession,
  states: {
    idle: {
      on: {
        "draft-changed": { actions: "changeDraft" },
        "files-changed": { actions: "changeFiles" },
        "files-added": { actions: "addFiles" },
        "temporary-changed": { actions: "changeTemporary" },
        "fresh-started": { actions: "startFresh" },
        "conversation-opened": { actions: "openConversation" },
        "thread-opened": { actions: "openThread" },
        "conversation-identified": { actions: "identifyConversation" },
        "stream-started": { target: "streaming", actions: "startStream" },
        "stream-resumed": { target: "streaming", actions: "resumeStream" },
        "error-reported": { actions: "reportError" },
        "error-cleared": { actions: "clearError" },
        "queued-follow-up-forced": { actions: "forceQueuedFollowUp" },
        "queued-follow-up-updated": { actions: "updateQueuedFollowUp" },
        "queued-follow-up-removed": { actions: "removeQueuedFollowUp" },
        "queued-follow-ups-replaced": { actions: "replaceQueuedFollowUps" },
      },
    },
    streaming: {
      on: {
        "draft-changed": { actions: "changeDraft" },
        "files-changed": { actions: "changeFiles" },
        "files-added": { actions: "addFiles" },
        "temporary-changed": { actions: "changeTemporary" },
        "fresh-started": { target: "idle", actions: "startFresh" },
        "conversation-opened": { target: "idle", actions: "openConversation" },
        "thread-opened": { target: "idle", actions: "openThread" },
        "conversation-identified": { actions: "identifyConversation" },
        "stream-message": { actions: "updateStream" },
        "stream-finished": { target: "idle" },
        "error-reported": { actions: "reportError" },
        "error-cleared": { actions: "clearError" },
        "follow-up-queued": { actions: "queueFollowUp" },
        "queued-follow-up-forced": { target: "idle", actions: "forceQueuedFollowUp" },
        "queued-follow-up-updated": { actions: "updateQueuedFollowUp" },
        "queued-follow-up-removed": { actions: "removeQueuedFollowUp" },
        "queued-follow-ups-replaced": { actions: "replaceQueuedFollowUps" },
      },
    },
  },
});
