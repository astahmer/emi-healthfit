"use client";

import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useAui,
  type Tool,
} from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useEffect, useState } from "react";
import { useSettings } from "./settings-store";
import { buildFrontendTools, fetchTools, type ToolDefinition } from "./tools";

function ToolRegistrar({ children }: { children: ReactNode }) {
  const settings = useSettings((state) => state.settings);
  const [definitions, setDefinitions] = useState<ToolDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const aui = useAui();

  useEffect(() => {
    fetchTools()
      .then(setDefinitions)
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, []);

  useEffect(() => {
    const tools: Record<string, Tool<Record<string, unknown>, unknown>> =
      buildFrontendTools(definitions);
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
        <div className="fixed right-4 top-4 z-50 rounded-md bg-red-100 px-4 py-2 text-sm text-red-800 dark:bg-red-900 dark:text-red-100">
          {error}
        </div>
      )}
      {children}
    </>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const settings = useSettings((state) => state.settings);

  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: async (options) => {
        return {
          ...options,
          body: {
            ...(options.body as Record<string, unknown>),
            config: {
              provider: settings.provider,
              apiKey: settings.apiKey,
              baseUrl: settings.baseUrl || undefined,
              model: settings.model,
            },
          },
        };
      },
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ToolRegistrar>{children}</ToolRegistrar>
    </AssistantRuntimeProvider>
  );
}
