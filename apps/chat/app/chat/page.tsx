"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useMachine } from "@xstate/react";
import { useAuiState } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { chatModels } from "../models";
import { ChatProviders } from "../providers";
import { useSettings } from "../settings-store";
import type { UIMessage } from "ai";
import { SessionSidebar } from "./session-sidebar";
import { useSessionFlag, useSessionParam } from "./use-session-params";
import { UsageProvider } from "../usage-context";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { DownloadIcon, PencilIcon, CheckIcon, XIcon, PlusIcon } from "lucide-react";
import { chatSessionMachine } from "./chat-session-machine";

const HEADER_HEIGHT = 56;

function ChatPageInner() {
  const settings = useSettings((state) => state.settings);
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const router = useRouter();
  const sessionId = searchParams.get("id") ?? undefined;

  const [model, setModel] = useSessionParam("model", settings.model);
  const [coachMode, setCoachMode] = useSessionFlag("coach", settings.coachMode);
  const [webSearch, setWebSearch] = useSessionFlag("web", false);
  const [temporary, setTemporary] = useState(false);

  const savedModelRef = useRef<string | null>(null);
  const urlSyncedRef = useRef(false);

  const [state, send] = useMachine(chatSessionMachine, {
    input: { sessionId },
  });

  const isRunning = useAuiState((s) => s.thread.isRunning);

  useEffect(() => {
    send({ type: "sessionId.changed", sessionId });
  }, [sessionId, send]);

  useEffect(() => {
    if (isRunning) {
      urlSyncedRef.current = false;
      return;
    }
    const createdId = state.context.createdSessionId;
    if (createdId === undefined || urlSyncedRef.current) return;
    urlSyncedRef.current = true;
    router.replace(`/chat?id=${createdId}`, { scroll: false });
  }, [isRunning, state.context.createdSessionId, router]);

  const selectedModel = chatModels.find((m) => m.id === model);
  const canWebSearch = selectedModel?.supportsWebSearch ?? false;

  useEffect(() => {
    if (webSearch && canWebSearch) {
      savedModelRef.current = null;
    }
  }, [model, webSearch, canWebSearch]);

  const handleWebSearchChange = (next: boolean) => {
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
  };

  const thread = state.context.thread;
  const initialMessages = state.context.messages;
  const isLoading = state.matches("loading");
  const loadError = state.matches("error") ? state.context.error : null;
  const isRenaming = state.matches("renaming") || state.matches("submittingRename");

  return (
    <SidebarProvider
      className="flex h-full"
      defaultWidth={state.context.sidebarWidth}
      onWidthChange={(width) => send({ type: "sidebar.widthChanged", width })}
      style={{ "--sidebar-top": `${HEADER_HEIGHT}px` } as React.CSSProperties}
    >
      <SessionSidebar />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Loading session…
        </div>
      ) : loadError !== null && sessionId !== undefined ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-destructive">{loadError.message}</p>
          <button
            type="button"
            onClick={() => send({ type: "retry" })}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Retry
          </button>
        </div>
      ) : (
        <ErrorBoundary
          key={`${state.context.createdSessionId === sessionId ? "created" : (sessionId ?? "new")}-${state.context.resetKey}`}
          onReset={() => {
            send({ type: "reset" });
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
                sessionId,
                initialMessages: initialMessages as UIMessage[] | undefined,
              }}
              onSessionCreated={(id) => send({ type: "session.created", sessionId: id })}
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
                            send({ type: "rename.submit" });
                          }}
                        >
                          <input
                            value={state.context.renameDraft}
                            onChange={(e) => send({ type: "rename.change", value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") send({ type: "rename.cancel" });
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
                            onClick={() => send({ type: "rename.cancel" })}
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
                            onClick={() => send({ type: "rename.start" })}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Rename session"
                          >
                            <PencilIcon className="size-4" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                  <div className="ms-auto flex items-center gap-1">
                    <NewChatButton />
                    {sessionId && (
                      <TooltipIconButton
                        tooltip="Export as Markdown"
                        side="bottom"
                        type="button"
                        variant="ghost"
                        onClick={() => send({ type: "export" })}
                      >
                        <DownloadIcon className="size-4" />
                      </TooltipIconButton>
                    )}
                  </div>
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
              </div>
            </ChatProviders>
          </UsageProvider>
        </ErrorBoundary>
      )}
    </SidebarProvider>
  );
}

const NewChatButton = () => {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5 rounded-full"
      aria-label="New chat"
      onClick={() => router.push("/chat")}
    >
      <PlusIcon className="size-4" />
      <span className="hidden md:inline">New chat</span>
    </Button>
  );
};

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}
