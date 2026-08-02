import { assign, setup } from "xstate";
import type { Attachment, ChatMessage } from "../protocol/index.ts";

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
  | { type: "error-reported"; error: string }
  | { type: "follow-up-queued"; followUp: QueuedFollowUp }
  | { type: "queued-follow-up-forced"; id: string }
  | { type: "queued-follow-up-removed"; id: string };

export const initialChatSession: ChatSession = {
  conversationId: undefined,
  threadId: undefined,
  messages: [],
  draft: "",
  files: [],
  temporary: false,
  error: undefined,
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
        ? { messages: event.messages, draft: "", files: [], error: undefined }
        : {},
    ),
    resumeStream: assign({ error: () => undefined }),
    updateStream: assign(({ context, event }) =>
      event.type === "stream-message"
        ? { messages: replaceMessage({ messages: context.messages, message: event.message }) }
        : {},
    ),
    reportError: assign(({ event }) =>
      event.type === "error-reported" ? { error: event.error } : {},
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
        "queued-follow-up-removed": { actions: "removeQueuedFollowUp" },
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
        "follow-up-queued": { actions: "queueFollowUp" },
        "queued-follow-up-forced": { target: "idle", actions: "forceQueuedFollowUp" },
        "queued-follow-up-removed": { actions: "removeQueuedFollowUp" },
      },
    },
  },
});
