"use client";

import type { ReactNode } from "react";
import { AssistantRuntimeProvider, useAui, useLocalRuntime, type Tool } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useEffect, useState } from "react";
import { useSettings } from "./settings-store";
import { buildFrontendTools, fetchTools, type ToolDefinition } from "./tools";
import { createDirectAdapter } from "./direct-adapter";

function ToolRegistrar({ children }: { children: ReactNode }) {
  const settings = useSettings((state) => state.settings);
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
    return aui.modelContext().register({
      getModelContext: () => ({
        system: settings.systemPrompt,
        tools,
      }),
    });
  }, [aui, definitions, settings.systemPrompt]);

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

function ProxyRuntime({ children }: { children: ReactNode }) {
  const settings = useSettings((state) => state.settings);

  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: async (options) => {
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
              apiKey: settings.apiKey,
              baseUrl: settings.baseUrl || undefined,
              model: settings.model,
            },
            coachMode: settings.coachMode,
          },
        };
      },
    }),
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

function DirectRuntime({ children }: { children: ReactNode }) {
  const settings = useSettings((state) => state.settings);
  const adapter = createDirectAdapter(settings);
  const runtime = useLocalRuntime(adapter);

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  const mode = useSettings((state) => state.settings.mode);
  const RuntimeProvider = mode === "direct" ? DirectRuntime : ProxyRuntime;

  return (
    <RuntimeProvider>
      <ToolRegistrar>{children}</ToolRegistrar>
    </RuntimeProvider>
  );
}
