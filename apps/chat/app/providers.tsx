"use client";

import type { ReactNode } from "react";
import type { UIMessage } from "ai";
import { NotesProvider } from "./notes-context";
import { ChatRuntimeProvider } from "./chat/chat-runtime";
import type { ConversationSnapshot } from "./conversations";

export interface ChatSessionConfig {
  model: string;
  coachMode: boolean;
  webSearch: boolean;
  temporary?: boolean;
  historyReady?: boolean;
  sessionId?: string;
  threadId?: string;
  initialMessages?: UIMessage[];
}

export const ChatProviders = ({
  sessionConfig,
  onSessionCreated,
  onHistoryChanged,
  children,
}: {
  sessionConfig: ChatSessionConfig;
  onSessionCreated?: (id: string) => void;
  onHistoryChanged?: (snapshot: ConversationSnapshot) => void;
  children: ReactNode;
}) => (
  <NotesProvider>
    <ChatRuntimeProvider
      config={{
        model: sessionConfig.model,
        coachMode: sessionConfig.coachMode,
        webSearch: sessionConfig.webSearch,
        temporary: sessionConfig.temporary ?? false,
        historyReady: sessionConfig.historyReady ?? true,
        sessionId: sessionConfig.sessionId,
        threadId: sessionConfig.threadId,
        initialMessages: sessionConfig.initialMessages ?? [],
      }}
      onSessionCreated={onSessionCreated}
      onHistoryChanged={onHistoryChanged}
    >
      {children}
    </ChatRuntimeProvider>
  </NotesProvider>
);
