"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Thread } from "@/components/assistant-ui/thread";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { chatModels } from "../models";
import { ChatProviders } from "../providers";
import { useSettings } from "../settings-store";
import type { UIMessage } from "ai";
import { fetchThreadMessages, renameThread } from "../sessions";
import { SessionSidebar } from "./session-sidebar";
import { useSessionFlag, useSessionParam } from "./use-session-params";
import { useThreadData } from "./use-thread-data";
import { UsageProvider } from "../usage-context";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { DownloadIcon, PencilIcon, CheckIcon, XIcon, PlusIcon } from "lucide-react";

const SIDEBAR_WIDTH_KEY = "emi-sidebar-width";
const HEADER_HEIGHT = 56;

function ChatPageInner() {
  const settings = useSettings((state) => state.settings);
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const sessionId = searchParams.get("id") ?? undefined;

  const [model, setModel] = useSessionParam("model", settings.model);
  const [coachMode, setCoachMode] = useSessionFlag("coach", settings.coachMode);
  const [webSearch, setWebSearch] = useSessionFlag("web", false);
  const [temporary, setTemporary] = useState(false);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [resetKey, setResetKey] = useState(0);

  const savedModelRef = useRef<string | null>(null);

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 16;
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return stored ? Number.parseFloat(stored) : 16;
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const { data: sessionData, isLoading, error, refetch } = useThreadData(sessionId);

  const thread = sessionData?.thread ?? null;
  const initialMessages = sessionData?.messages;

  const selectedModel = chatModels.find((m) => m.id === model);
  const canWebSearch = selectedModel?.supportsWebSearch ?? false;

  const runtimeSessionId = sessionId;

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

  useEffect(() => {
    if (webSearch && canWebSearch) {
      savedModelRef.current = null;
    }
  }, [model, webSearch, canWebSearch]);

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameThread(id, title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["thread", sessionId] });
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  const startRename = () => {
    setRenameDraft(thread?.title ?? "");
    setIsRenaming(true);
  };

  const cancelRename = () => {
    setIsRenaming(false);
    setRenameDraft("");
  };

  const submitRename = async () => {
    if (sessionId === undefined || renameDraft.trim() === "") {
      cancelRename();
      return;
    }
    await renameMutation.mutateAsync({ id: sessionId, title: renameDraft.trim() });
    setIsRenaming(false);
  };

  return (
    <SidebarProvider
      className="flex h-full"
      defaultWidth={sidebarWidth}
      onWidthChange={setSidebarWidth}
      style={{ "--sidebar-top": `${HEADER_HEIGHT}px` } as React.CSSProperties}
    >
      <SessionSidebar />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Loading session…
        </div>
      ) : error !== null && sessionId !== undefined ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-destructive">{error.message}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Retry
          </button>
        </div>
      ) : (
        <ErrorBoundary
          key={`${sessionId ?? "new"}-${resetKey}`}
          onReset={() => {
            setResetKey((k) => k + 1);
            void queryClient.invalidateQueries({ queryKey: ["thread", sessionId] });
          }}
        >
          <UsageProvider messages={initialMessages ?? []}>
            <ChatProviders
              sessionConfig={{
                model,
                coachMode,
                webSearch,
                temporary,
                sessionId: runtimeSessionId,
                initialMessages: initialMessages as UIMessage[] | undefined,
              }}
            >
              <div className="flex h-full flex-1 flex-col">
                <div className="flex items-center gap-2 border-b px-2 py-1.5 md:px-4 md:py-2">
                  <SidebarTrigger />
                  {sessionId && thread !== null && (
                    <>
                      {isRenaming ? (
                        <form
                          className="flex flex-1 items-center gap-2 px-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void submitRename();
                          }}
                        >
                          <input
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") cancelRename();
                            }}
                            autoFocus
                            aria-label="Session title"
                            className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm outline-none"
                          />
                          <button
                            type="submit"
                            className="rounded-md p-1 hover:bg-muted"
                            aria-label="Save title"
                          >
                            <CheckIcon className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelRename}
                            className="rounded-md p-1 hover:bg-muted"
                            aria-label="Cancel rename"
                          >
                            <XIcon className="size-4" />
                          </button>
                        </form>
                      ) : (
                        <>
                          <span className="flex-1 truncate px-2 text-sm font-medium">
                            {thread.title ?? "New chat"}
                          </span>
                          <button
                            type="button"
                            onClick={startRename}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Rename session"
                          >
                            <PencilIcon className="size-4" />
                          </button>
                        </>
                      )}
                    </>
                  )}
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
                      temporary,
                      onTemporaryChange: setTemporary,
                      models: chatModels,
                      canWebSearch,
                    }}
                  />
                </div>
                <MobileNewChatButton />
              </div>
            </ChatProviders>
          </UsageProvider>
        </ErrorBoundary>
      )}
    </SidebarProvider>
  );
}

const MobileNewChatButton = () => {
  const router = useRouter();
  return (
    <Button
      size="icon"
      className="fixed bottom-24 right-5 z-40 size-12 rounded-full bg-primary text-primary-foreground shadow-xl ring-2 ring-background transition-transform hover:scale-105 active:scale-95 md:hidden"
      aria-label="New chat"
      onClick={() => router.push("/chat")}
    >
      <PlusIcon className="size-5" />
    </Button>
  );
};

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
