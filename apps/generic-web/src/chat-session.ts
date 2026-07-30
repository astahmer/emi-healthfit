import type { FileUIPart, UIMessage } from "ai";

export interface QueuedFollowUp {
  id: string;
  text: string;
  files: FileUIPart[];
}

export interface ChatSession {
  conversationId: string | undefined;
  threadId: string | undefined;
  messages: UIMessage[];
  draft: string;
  files: FileUIPart[];
  temporary: boolean;
  streaming: boolean;
  error: string | undefined;
  queuedFollowUps: QueuedFollowUp[];
}

export type ChatSessionAction =
  | { type: "draft-changed"; draft: string }
  | { type: "files-changed"; files: FileUIPart[] }
  | { type: "files-added"; files: FileUIPart[] }
  | { type: "temporary-changed"; temporary: boolean }
  | { type: "fresh-started" }
  | { type: "conversation-opened"; conversationId: string; messages: UIMessage[] }
  | { type: "thread-opened"; threadId: string; messages: UIMessage[] }
  | { type: "conversation-identified"; conversationId: string }
  | { type: "stream-started"; messages: UIMessage[] }
  | { type: "stream-resumed" }
  | { type: "stream-message"; message: UIMessage }
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
  streaming: false,
  error: undefined,
  queuedFollowUps: [],
};

const replaceMessage = ({
  messages,
  message,
}: {
  messages: UIMessage[];
  message: UIMessage;
}): UIMessage[] => {
  const index = messages.findIndex((candidate) => candidate.id === message.id);
  if (index < 0) return [...messages, message];
  return [...messages.slice(0, index), message, ...messages.slice(index + 1)];
};

export const reduceChatSession = (session: ChatSession, action: ChatSessionAction): ChatSession => {
  switch (action.type) {
    case "draft-changed":
      return { ...session, draft: action.draft };
    case "files-changed":
      return { ...session, files: action.files };
    case "files-added":
      return { ...session, files: [...session.files, ...action.files] };
    case "temporary-changed":
      return { ...session, temporary: action.temporary };
    case "fresh-started":
      return { ...initialChatSession, temporary: session.temporary };
    case "conversation-opened":
      return {
        ...initialChatSession,
        conversationId: action.conversationId,
        messages: action.messages,
      };
    case "thread-opened":
      return {
        ...initialChatSession,
        conversationId: session.conversationId,
        threadId: action.threadId,
        messages: action.messages,
      };
    case "conversation-identified":
      return { ...session, conversationId: action.conversationId };
    case "stream-started":
      return {
        ...session,
        messages: action.messages,
        draft: "",
        files: [],
        error: undefined,
        streaming: true,
      };
    case "stream-resumed":
      return { ...session, error: undefined, streaming: true };
    case "stream-message":
      return {
        ...session,
        messages: replaceMessage({ messages: session.messages, message: action.message }),
      };
    case "stream-finished":
      return { ...session, streaming: false };
    case "error-reported":
      return { ...session, error: action.error };
    case "follow-up-queued":
      return {
        ...session,
        draft: "",
        files: [],
        queuedFollowUps: [...session.queuedFollowUps, action.followUp],
      };
    case "queued-follow-up-forced": {
      const followUp = session.queuedFollowUps.find((item) => item.id === action.id);
      if (followUp === undefined) return session;
      return {
        ...session,
        draft: followUp.text,
        files: followUp.files,
        streaming: false,
        queuedFollowUps: session.queuedFollowUps.filter((item) => item.id !== action.id),
      };
    }
    case "queued-follow-up-removed":
      return {
        ...session,
        queuedFollowUps: session.queuedFollowUps.filter((item) => item.id !== action.id),
      };
  }
};
