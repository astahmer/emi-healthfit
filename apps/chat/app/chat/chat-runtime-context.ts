import { createContext, useContext } from "react";
import type { FileUIPart, UIMessage } from "ai";

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

export interface ChatRuntimeValue {
  messages: UIMessage[];
  sessionId: string | undefined;
  draft: string;
  files: FileUIPart[];
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

export const ChatRuntimeContext = createContext<ChatRuntimeValue | null>(null);

export const useChatRuntime = (): ChatRuntimeValue => {
  const context = useContext(ChatRuntimeContext);
  if (context === null) throw new Error("useChatRuntime must be used within ChatRuntimeProvider");
  return context;
};
