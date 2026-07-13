"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
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
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { DownloadIcon } from "lucide-react";

const SIDEBAR_WIDTH_KEY = "emi-sidebar-width";
const HEADER_HEIGHT = 65;

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

  const savedModelRef = useRef<string | null>(null);

  const [sidebarWidth, setSidebarWidthState] = useState<number>(() => {
    if (typeof window === "undefined") return 16;
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return stored ? Number.parseFloat(stored) : 16;
  });

  const setSidebarWidth = useCallback((width: number) => {
    setSidebarWidthState(width);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  }, []);

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

  const handleWebSearchChange = useCallback(
    (next: boolean) => {
      if (next && !canWebSearch) {
        const currentIdx = chatModels.findIndex((m) => m.id === model);
        const supported =
          chatModels.find((m, i) => m.supportsWebSearch && i >= currentIdx) ??
          chatModels.find((m) => m.supportsWebSearch);
        if (supported) {
          savedModelRef.current = model;
          setModel(supported.id);
        }
      } else if (!next && savedModelRef.current) {
        setModel(savedModelRef.current);
        savedModelRef.current = null;
      }
      setWebSearch(next);
    },
    [model, canWebSearch, setModel, setWebSearch],
  );

  // Clear saved model if user manually changes model while web search is ON
  useEffect(() => {
    if (webSearch && canWebSearch) {
      savedModelRef.current = null;
    }
  }, [model, webSearch, canWebSearch]);

  return (
    <SidebarProvider
      defaultWidth={sidebarWidth}
      onWidthChange={setSidebarWidth}
      style={{ "--sidebar-top": `${HEADER_HEIGHT}px` } as React.CSSProperties}
    >
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
                <div className="flex items-center gap-2 border-b px-2 py-1.5 md:px-4 md:py-2">
                  <SidebarTrigger />
                  {sessionId && <ExportThreadButton sessionId={sessionId} className="ms-auto" />}
                </div>
                <div className="flex-1 overflow-hidden">
                  <Thread
                    composerControls={{
                      model,
                      onModelChange: setModel,
                      coachMode,
                      onCoachModeChange: setCoachMode,
                      webSearch,
                      onWebSearchChange: handleWebSearchChange,
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

const ExportThreadButton = ({
  sessionId,
  className,
}: {
  sessionId: string;
  className?: string;
}) => {
  const handleClick = useCallback(async () => {
    try {
      const { messages } = await fetchThreadMessages(sessionId);
      const md = messages
        .map((msg) => {
          const role = msg.role === "user" ? "User" : "Assistant";
          const text =
            msg.parts
              ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
              .map((p) => p.text)
              .join("\n") ?? "";
          return `## ${role}\n\n${text}`;
        })
        .join("\n\n---\n\n");
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat-${sessionId.slice(0, 8)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    }
  }, [sessionId]);

  return (
    <TooltipIconButton
      tooltip="Export as Markdown"
      side="bottom"
      type="button"
      variant="ghost"
      className={className}
      onClick={handleClick}
    >
      <DownloadIcon className="size-4" />
    </TooltipIconButton>
  );
};

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}
