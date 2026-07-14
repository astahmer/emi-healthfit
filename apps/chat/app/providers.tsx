"use client";

import type { ReactNode } from "react";
import { AssistantRuntimeProvider, useAui, useLocalRuntime, type Tool } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { useSettings } from "./settings-store";
import { buildFrontendTools, fetchTools, type ToolDefinition } from "./tools";
import { createDirectAdapter } from "./direct-adapter";
import { buildNotesContext } from "./notes";
import { NotesProvider, useNotes } from "./notes-context";
import { createThread } from "./sessions";

export interface ChatSessionConfig {
  model: string;
  coachMode: boolean;
  webSearch: boolean;
  sessionId?: string;
  initialMessages?: UIMessage[];
}

function ToolRegistrar({ children }: { children: ReactNode }) {
  const settings = useSettings((state) => state.settings);
  const { notes } = useNotes();
  const [definitions, setDefinitions] = useState<ToolDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const aui = useAui();

  useEffect(() => {
    fetchTools()
      .then(setDefinitions)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    const tools: Record<string, Tool<Record<string, unknown>, unknown>> = buildFrontendTools(
      definitions,
    );
    const notesContext = buildNotesContext(notes);
    const system =
      notesContext === "" ? settings.systemPrompt : `${settings.systemPrompt}\n\n${notesContext}`;
    return aui.modelContext().register({
      getModelContext: () => ({
        system,
        tools,
      }),
    });
  }, [aui, definitions, settings.systemPrompt, notes]);

  return (
    <>
      {error !== null && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-md bg-red-100 px-4 py-2 text-sm text-red-800 dark:bg-red-900 dark:text-red-100">
          {error}
        </div>
      )}
      {children}
    </>
  );
}

function ProxyRuntime({
  sessionConfig,
  children,
}: {
  sessionConfig: ChatSessionConfig;
  children: ReactNode;
}) {
  const settings = useSettings((state) => state.settings);
  const createdThreadIdRef = useRef<string | null>(null);

  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    messages: sessionConfig.initialMessages,
    transport: new AssistantChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: async (options) => {
        let sessionId = sessionConfig.sessionId ?? createdThreadIdRef.current;
        if (sessionId === null) {
          sessionId = await createThread();
          createdThreadIdRef.current = sessionId;
          window.history.replaceState({}, "", `/chat?id=${sessionId}`);
        }

        const baseBody = (options.body ?? {}) as Record<string, unknown>;
        return {
          ...options,
          body: {
            ...baseBody,
            id: options.id,
            messages: options.messages,
            trigger: options.trigger,
            messageId: options.messageId,
            metadata: options.requestMetadata,
            config: {
              provider: settings.provider,
              apiKey: settings.apiKey || process.env.NEXT_PUBLIC_OPENAI_API_KEY || "",
              baseUrl: settings.baseUrl || undefined,
              model: sessionConfig.model,
            },
            coachMode: sessionConfig.coachMode,
            webSearch: sessionConfig.webSearch,
            sessionId,
          },
        };
      },
    }),
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

function DirectRuntime({ children }: { children: ReactNode }) {
  const settings = useSettings((state) => state.settings);
  const { notes } = useNotes();
  const notesContext = buildNotesContext(notes);
  const system =
    notesContext === "" ? settings.systemPrompt : `${settings.systemPrompt}\n\n${notesContext}`;
  const adapter = createDirectAdapter(settings, system);
  const runtime = useLocalRuntime(adapter);

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

function ChatRuntime({
  sessionConfig,
  children,
}: {
  sessionConfig: ChatSessionConfig;
  children: ReactNode;
}) {
  const mode = useSettings((state) => state.settings.mode);
  if (mode === "direct") return <DirectRuntime>{children}</DirectRuntime>;
  return <ProxyRuntime sessionConfig={sessionConfig}>{children}</ProxyRuntime>;
}

export function ChatProviders({
  sessionConfig,
  children,
}: {
  sessionConfig: ChatSessionConfig;
  children: ReactNode;
}) {
  return (
    <NotesProvider>
      <ChatRuntime sessionConfig={sessionConfig}>
        <ToolRegistrar>{children}</ToolRegistrar>
      </ChatRuntime>
    </NotesProvider>
  );
}
