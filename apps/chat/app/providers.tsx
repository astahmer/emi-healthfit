"use client";

import type { ReactNode } from "react";
import type { UIMessage } from "ai";
import { NotesProvider } from "./notes-context";
import { ChatRuntimeProvider } from "./chat/chat-runtime";

export interface ChatSessionConfig {
  model: string;
  coachMode: boolean;
  webSearch: boolean;
  temporary?: boolean;
  historyReady?: boolean;
  sessionId?: string;
  initialMessages?: UIMessage[];
}

export const ChatProviders = ({
  sessionConfig,
  onSessionCreated,
  children,
}: {
  sessionConfig: ChatSessionConfig;
  onSessionCreated?: (id: string) => void;
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
        initialMessages: sessionConfig.initialMessages ?? [],
      }}
      onSessionCreated={onSessionCreated}
    >
      {children}
    </ChatRuntimeProvider>
  </NotesProvider>
);
