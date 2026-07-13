"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Thread } from "@/components/assistant-ui/thread";
import { ErrorBoundary } from "@/components/error-boundary";
import { chatModels } from "../models";
import { ChatProviders } from "../providers";
import { useSettings } from "../settings-store";
import type { UIMessage } from "ai";
import { fetchThreadMessages, type MessageWithUsage } from "../sessions";
import { SessionSidebar, SessionSidebarToggle } from "./session-sidebar";
import { useSessionFlag, useSessionParam } from "./use-session-params";
import { UsageProvider, useUsage } from "../usage-context";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    <div className="flex h-full">
      <SessionSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen((open) => !open)} />

      {sessionId === undefined ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="mb-2 text-lg font-medium">Start a new chat</p>
            <p className="text-sm">Create a session from the sidebar to begin.</p>
          </div>
        </div>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Loading session…
        </div>
      ) : error !== null ? (
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
        <ErrorBoundary key={sessionId}>
          <UsageProvider
            usages={(initialMessages ?? [])
              .filter((message): message is MessageWithUsage & { usage: NonNullable<MessageWithUsage["usage"]> } =>
                message.usage !== undefined,
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
                <div className="flex flex-wrap items-center gap-4 border-b px-4 py-2">
                  <SessionSidebarToggle onToggle={() => setSidebarOpen((open) => !open)} />

                <div className="flex items-center gap-2">
                <label htmlFor="session-model" className="text-sm font-medium">
                  Model
                </label>
                <select
                  id="session-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {chatModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={coachMode}
                  onChange={(e) => setCoachMode(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Coach mode
              </label>

              <label
                className={`flex items-center gap-2 text-sm ${!canWebSearch ? "text-muted-foreground" : ""}`}
                title={
                  canWebSearch
                    ? "Search the web for real-time info"
                    : "Switch to a responses-capable model (GPT-5 / GPT-5.2) to enable web search"
                }
              >
                <input
                  type="checkbox"
                  checked={webSearch}
                  onChange={(e) => setWebSearch(e.target.checked)}
                  disabled={!canWebSearch}
                  className="h-4 w-4 rounded border-input"
                />
                Web search
              </label>

              <TokenBadge />
            </div>

            <div className="flex-1 overflow-hidden">
              <Thread />
            </div>
              </div>
            </ChatProviders>
          </UsageProvider>
        </ErrorBoundary>
      )}
    </div>
  );
}

const TokenBadge = () => {
  const { totalUsage } = useUsage();

  if (totalUsage.totalTokens === 0) return null;

  return (
    <span className="ms-auto text-xs text-muted-foreground tabular-nums">
      {totalUsage.totalTokens.toLocaleString()} tokens
    </span>
  );
};

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}
