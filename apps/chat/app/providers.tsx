"use client";

import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  AuiProvider,
  Suggestions,
  useAui,
  useAuiState,
  useLocalRuntime,
  type Tool,
} from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSettings } from "./settings-store";
import { buildTools, fetchTools, type ToolDefinition } from "./tools";
import { createDirectAdapter } from "./direct-adapter";
import { buildNotesContext } from "./notes";
import { NotesProvider, useNotes } from "./notes-context";
import { createThread } from "./sessions";
import { ComposerDraftSync } from "./chat/composer-draft-sync";

export interface ChatSessionConfig {
  model: string;
  coachMode: boolean;
  webSearch: boolean;
  temporary?: boolean;
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
    const tools: Record<string, Tool<Record<string, unknown>, unknown>> = buildTools(
      definitions,
      settings.mode === "direct" ? "frontend" : "backend",
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
  }, [aui, definitions, settings.mode, settings.systemPrompt, notes]);

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

function UrlSync({
  createdThreadIdRef,
  temporary,
}: {
  createdThreadIdRef: React.MutableRefObject<string | null>;
  temporary?: boolean;
}) {
  const router = useRouter();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current || temporary) return;
    const id = createdThreadIdRef.current;
    if (id === null || isRunning) return;
    syncedRef.current = true;
    router.replace(`/chat?id=${id}`, { scroll: false });
  }, [isRunning, router, createdThreadIdRef, temporary]);

  return null;
}

function WelcomeSuggestions({ children }: { children: ReactNode }) {
  const aui = useAui({
    suggestions: Suggestions([
      {
        title: "How is my",
        label: "recovery today?",
        prompt: "How is my recovery today?",
      },
      {
        title: "Summarize my",
        label: "last workout",
        prompt: "Summarize my last workout.",
      },
      {
        title: "Show my",
        label: "workout streak",
        prompt: "What's my current workout streak?",
      },
      {
        title: "Progress on",
        label: "bench press",
        prompt: "Show my progress on bench press over the last 8 weeks.",
      },
      {
        title: "Compare",
        label: "recent squat sessions",
        prompt: "Compare my recent squat sessions.",
      },
    ]),
  });

  return <AuiProvider value={aui}>{children}</AuiProvider>;
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
    messages: sessionConfig.initialMessages,
    transport: new AssistantChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: async (options) => {
        let sessionId = sessionConfig.sessionId ?? createdThreadIdRef.current;
        if (sessionId === null) {
          if (sessionConfig.temporary) {
            sessionId = `temp_${crypto.randomUUID()}`;
          } else {
            sessionId = await createThread();
          }
          createdThreadIdRef.current = sessionId;
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
              apiKey: settings.apiKey || "",
              baseUrl: settings.baseUrl || undefined,
              model: sessionConfig.model,
            },
            coachMode: sessionConfig.coachMode,
            webSearch: sessionConfig.webSearch,
            temporary: sessionConfig.temporary,
            sessionId,
          },
        };
      },
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <WelcomeSuggestions>
        {children}
        <UrlSync createdThreadIdRef={createdThreadIdRef} temporary={sessionConfig.temporary} />
      </WelcomeSuggestions>
    </AssistantRuntimeProvider>
  );
}

function DirectRuntime({ children }: { children: ReactNode }) {
  const settings = useSettings((state) => state.settings);
  const { notes } = useNotes();
  const notesContext = buildNotesContext(notes);
  const system =
    notesContext === "" ? settings.systemPrompt : `${settings.systemPrompt}\n\n${notesContext}`;
  const adapter = createDirectAdapter(settings, system);
  const runtime = useLocalRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <WelcomeSuggestions>{children}</WelcomeSuggestions>
    </AssistantRuntimeProvider>
  );
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
        <ToolRegistrar>
          <ComposerDraftSync sessionId={sessionConfig.sessionId} />
          {children}
        </ToolRegistrar>
      </ChatRuntime>
    </NotesProvider>
  );
}
