"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Thread } from "@/components/assistant-ui/thread";
import { ErrorBoundary } from "@/components/error-boundary";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { chatModels } from "../models";
import { ChatProviders } from "../providers";
import { useSettings } from "../settings-store";
import type { UIMessage } from "ai";
import { fetchThreadMessages, type MessageWithUsage } from "../sessions";
import { SessionSidebar } from "./session-sidebar";
import { useSessionFlag, useSessionParam } from "./use-session-params";
import { UsageProvider } from "../usage-context";

function ChatPageInner() {
  const settings = useSettings((state) => state.settings);
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("id") ?? undefined;

  const [model, setModel] = useSessionParam("model", settings.model);
  const [coachMode, setCoachMode] = useSessionFlag("coach", settings.coachMode);
  const [webSearch, setWebSearch] = useSessionFlag("web", false);

  const [initialMessages, setInitialMessages] = useState<MessageWithUsage[] | undefined>(undefined);
  const [loading, setLoading] = useState(sessionId !== undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId === undefined) {
      setInitialMessages(undefined);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchThreadMessages(sessionId)
      .then((data) => setInitialMessages(data.messages))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const selectedModel = chatModels.find((m) => m.id === model);
  const canWebSearch = selectedModel?.supportsWebSearch ?? false;

  return (
    <SidebarProvider className="h-full">
      <SessionSidebar />

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Loading session…
        </div>
      ) : error !== null && sessionId !== undefined ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-destructive">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              fetchThreadMessages(sessionId)
                .then((data) => setInitialMessages(data.messages))
                .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setLoading(false));
            }}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Retry
          </button>
        </div>
      ) : (
        <ErrorBoundary key={sessionId ?? "new"}>
          <UsageProvider
            usages={(initialMessages ?? [])
              .filter(
                (
                  message,
                ): message is MessageWithUsage & {
                  usage: NonNullable<MessageWithUsage["usage"]>;
                } => message.usage !== undefined,
              )
              .map((message) => ({ messageId: message.id, usage: message.usage }))}
          >
            <ChatProviders
              sessionConfig={{
                model,
                coachMode,
                webSearch,
                sessionId,
                initialMessages: initialMessages as UIMessage[] | undefined,
              }}
            >
              <div className="flex h-full flex-1 flex-col">
                <div className="flex items-center gap-2 border-b px-4 py-2">
                  <SidebarTrigger />
                </div>
                <div className="flex-1 overflow-hidden">
                  <Thread
                    composerControls={{
                      model,
                      onModelChange: setModel,
                      coachMode,
                      onCoachModeChange: setCoachMode,
                      webSearch,
                      onWebSearchChange: setWebSearch,
                      models: chatModels,
                      canWebSearch,
                    }}
                  />
                </div>
              </div>
            </ChatProviders>
          </UsageProvider>
        </ErrorBoundary>
      )}
    </SidebarProvider>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}
