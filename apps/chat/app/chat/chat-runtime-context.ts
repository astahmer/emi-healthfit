import { createContext, useContext } from "react";
import type { FileUIPart } from "ai";
import type { ChatUiMessage } from "@emi/core/chat";

export interface QueuedFollowUp {
  id: string;
  text: string;
  files: FileUIPart[];
}

export interface ChatRuntimeConfig {
  model: string;
  coachMode: boolean;
  webSearch: boolean;
  temporary: boolean;
  historyReady: boolean;
  sessionId?: string;
  threadId?: string;
  initialMessages: ChatUiMessage[];
}

export interface ChatRuntimeValue {
  messages: ChatUiMessage[];
  sessionId: string | undefined;
  draft: string;
  files: FileUIPart[];
  queuedFollowUps: QueuedFollowUp[];
  editingQueuedId: string | null;
  isStreaming: boolean;
  isSending: boolean;
  isSendGraceActive: boolean;
  error: Error | null;
  errorMessageId: string | undefined;
  attachmentError: string | null;
  isPreparingAttachments: boolean;
  setDraft: (value: string) => void;
  addFiles: (files: FileList) => Promise<void>;
  removeFile: (url: string) => void;
  submit: (text?: string, options?: { interrupt?: boolean }) => Promise<void>;
  revise: (options: { messageId: string; text?: string }) => Promise<void>;
  orphanMessageId: string | undefined;
  retryOrphan: () => Promise<void>;
  isRetrying: boolean;
  stop: () => void;
  removeQueuedFollowUp: (id: string) => void;
  clearQueuedFollowUps: () => void;
  forceSendQueued: (id?: string) => Promise<void>;
  beginEditingQueuedFollowUp: (id: string) => void;
  clearQueuedFollowUpEdit: () => void;
  clearError: () => void;
}

export const ChatRuntimeContext = createContext<ChatRuntimeValue | null>(null);

export const useChatRuntime = (): ChatRuntimeValue => {
  const context = useContext(ChatRuntimeContext);
  if (context === null) throw new Error("useChatRuntime must be used within ChatRuntimeProvider");
  return context;
};
