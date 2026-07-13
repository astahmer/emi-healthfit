"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Thread } from "@/components/assistant-ui/thread";
import { chatModels } from "../models";
import { ChatProviders } from "../providers";
import { useSettings } from "../settings-store";
import type { UIMessage } from "ai";
import { fetchThreadMessages } from "../sessions";
import { SessionSidebar } from "./session-sidebar";
import { useSessionFlag, useSessionParam } from "./use-session-params";

function ChatPageInner() {
  const settings = useSettings((state) => state.settings);
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("id") ?? undefined;

  const [model, setModel] = useSessionParam("model", settings.model);
  const [coachMode, setCoachMode] = useSessionFlag("coach", settings.coachMode);
  const [webSearch, setWebSearch] = useSessionFlag("web", false);

  const [initialMessages, setInitialMessages] = useState<UIMessage[] | undefined>(undefined);
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
    <div className="flex h-full">
      <SessionSidebar />

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
        <div className="flex flex-1 items-center justify-center text-destructive">
          {error}
        </div>
      ) : (
        <ChatProviders
          sessionConfig={{
            model,
            coachMode,
            webSearch,
            sessionId,
            initialMessages,
          }}
        >
          <div className="flex h-full flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-4 border-b px-4 py-2">
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
            </div>

            <div className="flex-1 overflow-hidden">
              <Thread />
            </div>
          </div>
        </ChatProviders>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}
