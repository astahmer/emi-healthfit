"use client";

import { Suspense, useEffect, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useMachine } from "@xstate/react";
import { Thread } from "@/components/chat/thread";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { chatModels } from "../models";
import { ChatProviders } from "../providers";
import { useSettings } from "../settings-store";
import type { UIMessage } from "ai";
import type { MessageWithUsage, Thread as SessionThread } from "../sessions";
import { SessionSidebar } from "./session-sidebar";
import { useSessionFlag, useSessionParam } from "./use-session-params";
import { ConversationUsage, UsageProvider } from "../usage-context";
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button";
import { DownloadIcon, PencilIcon, CheckIcon, XIcon, PlusIcon } from "lucide-react";
import { useConversationMachine } from "./use-conversation-machine";
import { composerConfigMachine } from "./composer-config-machine";
import type { MessageNode } from "./conversation-machine";
import { getConversationViewMessages } from "./conversation-tree";
import { ThreadNavigation } from "./thread-navigation";

const HEADER_HEIGHT = 56;
type RuntimeMessage = MessageNode & { role: UIMessage["role"] };

const isRuntimeMessage = (message: MessageNode): message is RuntimeMessage =>
  message.role === "user" || message.role === "assistant" || message.role === "system";

const sidebarStyle: CSSProperties & { "--sidebar-top": string } = {
  "--sidebar-top": `${HEADER_HEIGHT}px`,
};
const sessionIdFromPath = (pathname: string): string | undefined => {
  const encodedSessionId = pathname.match(/^\/chat\/([^/]+)\/?$/)?.[1];
  return encodedSessionId === undefined ? undefined : decodeURIComponent(encodedSessionId);
};

const toRuntimeMessages = (messages: MessageNode[]): UIMessage[] =>
  messages.filter(isRuntimeMessage).map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts,
  }));

const toUsageMessages = (messages: MessageNode[]): MessageWithUsage[] =>
  messages.filter(isRuntimeMessage).map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts,
    usage: message.usage,
    model: message.model,
    createdAt: message.createdAt,
  }));

function ChatPageInner() {
  const settings = useSettings((state) => state.settings);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const sessionId = sessionIdFromPath(pathname);

  const [urlModel, setUrlModel] = useSessionParam("model", settings.model);
  const [urlCoachMode, setUrlCoachMode] = useSessionFlag("coach", settings.coachMode);
  const [urlWebSearch, setUrlWebSearch] = useSessionFlag("web", false);

  const { state: conversationState, send: sendConversation } = useConversationMachine(sessionId);
  const activeConversationId = sessionId;

  const [configState, sendConfig] = useMachine(composerConfigMachine, {
    input: {
      models: chatModels,
      model: urlModel,
      coachMode: urlCoachMode,
      webSearch: urlWebSearch,
    },
  });

  const selectedModel = chatModels.find((m) => m.id === configState.context.model);
  const canWebSearch = selectedModel?.supportsWebSearch ?? false;

  const historyMatchesSelection = conversationState.context.conversationId === activeConversationId;
  const conversation = historyMatchesSelection ? conversationState.context.conversation : null;
  const focusedThread = conversationState.context.threads.find(
    (thread) => thread.id === conversationState.context.focusedThreadId,
  );
  const initialMessages = historyMatchesSelection
    ? getConversationViewMessages({
        messages: conversationState.context.messages,
        thread: focusedThread,
      })
    : [];
  const isLoading = conversationState.matches("loading");
  const loadError = conversationState.matches("error") ? conversationState.context.error : null;
  const isRenaming = conversationState.matches({ ready: "renamingConversation" });

  const runtimeMessages = toRuntimeMessages(initialMessages);
  const usageMessages = toUsageMessages(initialMessages);

  useEffect(() => {
    if (conversation === null) return;
    queryClient.setQueriesData<SessionThread[]>({ queryKey: ["threads"] }, (threads) =>
      threads?.map((thread) =>
        thread.id === conversation.id ? { ...thread, title: conversation.title } : thread,
      ),
    );
  }, [conversation, queryClient]);

  return (
    <SidebarProvider
      className="flex h-full"
      defaultWidth={conversationState.context.sidebarWidth}
      onWidthChange={(width) => sendConversation({ type: "sidebar.widthChanged", width })}
      style={sidebarStyle}
    >
      <SessionSidebar
        onNewChat={() =>
          sendConversation({ type: "conversationId.changed", conversationId: undefined })
        }
      />

      <ErrorBoundary
        onReset={() => {
          sendConversation({ type: "reset" });
          void queryClient.invalidateQueries({ queryKey: ["thread", activeConversationId] });
        }}
      >
        <UsageProvider messages={usageMessages}>
          <ChatProviders
            sessionConfig={{
              model: configState.context.model,
              coachMode: configState.context.coachMode,
              webSearch: configState.context.webSearch,
              temporary: configState.context.temporary,
              historyReady: !isLoading && historyMatchesSelection,
              sessionId: activeConversationId,
              threadId: conversationState.context.focusedThreadId ?? undefined,
              initialMessages: runtimeMessages,
            }}
            onSessionCreated={(id) => {
              sendConversation({ type: "session.created", conversationId: id });
              window.history.replaceState(null, "", `/chat/${encodeURIComponent(id)}`);
            }}
            onHistoryChanged={(snapshot) =>
              sendConversation({
                type: "load.succeeded",
                conversation: snapshot.conversation,
                messages: snapshot.messages,
                threads: snapshot.threads,
              })
            }
          >
            <div className="relative flex h-full flex-1 flex-col">
              <div className="flex items-center gap-2 border-b px-2 py-1.5 md:px-4 md:py-2">
                <SidebarTrigger />
                {activeConversationId && conversation !== null && (
                  <>
                    {isRenaming ? (
                      <form
                        className="flex flex-1 items-center gap-2 px-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          sendConversation({ type: "conversation.rename.submit" });
                        }}
                      >
                        <input
                          value={conversationState.context.renameDraft}
                          onChange={(e) =>
                            sendConversation({
                              type: "conversation.rename.change",
                              value: e.target.value,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Escape")
                              sendConversation({ type: "conversation.rename.cancel" });
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
                          onClick={() => sendConversation({ type: "conversation.rename.cancel" })}
                          className="rounded-md p-1 hover:bg-muted"
                          aria-label="Cancel rename"
                        >
                          <XIcon className="size-4" />
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="flex-1 truncate px-2 text-sm font-medium">
                          {conversation.title ?? "New chat"}
                        </span>
                        <button
                          type="button"
                          onClick={() => sendConversation({ type: "conversation.rename.start" })}
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
                  {activeConversationId !== undefined && (
                    <ConversationUsage conversationId={activeConversationId} />
                  )}
                  <NewChatButton
                    onNewChat={() =>
                      sendConversation({
                        type: "conversationId.changed",
                        conversationId: undefined,
                      })
                    }
                  />
                  {activeConversationId && (
                    <TooltipIconButton
                      tooltip="Export as Markdown"
                      side="bottom"
                      type="button"
                      variant="ghost"
                      onClick={() => sendConversation({ type: "export" })}
                    >
                      <DownloadIcon className="size-4" />
                    </TooltipIconButton>
                  )}
                </div>
              </div>
              {activeConversationId !== undefined && !configState.context.temporary && (
                <ThreadNavigation
                  threads={conversationState.context.threads}
                  focusedThreadId={conversationState.context.focusedThreadId}
                  searchQuery={conversationState.context.searchQuery}
                  searchResults={conversationState.context.searchResults}
                  onFocus={(threadId) => sendConversation({ type: "thread.focus", threadId })}
                  onSearch={(query) => sendConversation({ type: "search.query", query })}
                  onRename={(threadId, title) =>
                    sendConversation({ type: "thread.rename", threadId, title })
                  }
                  onPin={(threadId, pinned) =>
                    sendConversation({ type: "thread.pin", threadId, pinned })
                  }
                  onDiscard={(threadId) => sendConversation({ type: "thread.discard", threadId })}
                  onRestore={(threadId) => sendConversation({ type: "thread.restore", threadId })}
                  onSummarize={(threadId) =>
                    sendConversation({ type: "thread.summarize", threadId })
                  }
                />
              )}
              <div className="flex-1 overflow-hidden">
                <Thread
                  onForkMessage={(messageId) =>
                    sendConversation({ type: "thread.fork", anchorMessageId: messageId })
                  }
                  onReferenceMessage={(messageId) => {
                    const referencedThread = conversationState.context.threads.find((thread) =>
                      thread.messageIds.includes(messageId),
                    );
                    sendConversation({
                      type: "thread.focus",
                      threadId: referencedThread?.id ?? null,
                    });
                    requestAnimationFrame(() =>
                      requestAnimationFrame(() =>
                        document.getElementById(`message-${messageId}`)?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        }),
                      ),
                    );
                  }}
                  composerControls={{
                    model: configState.context.model,
                    onModelChange: (model) => {
                      sendConfig({ type: "model.select", model });
                      setUrlModel(model);
                    },
                    coachMode: configState.context.coachMode,
                    onCoachModeChange: () => {
                      sendConfig({ type: "coach.toggle" });
                      setUrlCoachMode(!configState.context.coachMode);
                    },
                    webSearch: configState.context.webSearch,
                    onWebSearchChange: (value) => {
                      sendConfig({ type: "web.toggle", value });
                      setUrlWebSearch(value);
                    },
                    temporary: configState.context.temporary,
                    onTemporaryChange: (value) => {
                      sendConfig({ type: "temporary.toggle", value });
                      sendConversation({ type: "temporary.changed", isTemporary: value });
                      if (value && activeConversationId !== undefined) router.push("/chat");
                    },
                    models: chatModels,
                    canWebSearch,
                  }}
                />
              </div>
              {isLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/90 text-muted-foreground backdrop-blur-sm">
                  Loading session…
                </div>
              )}
              {loadError !== null && activeConversationId !== undefined && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/95 p-6 text-center backdrop-blur-sm">
                  <p className="text-destructive">{loadError.message}</p>
                  <button
                    type="button"
                    onClick={() => sendConversation({ type: "retry" })}
                    className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </ChatProviders>
        </UsageProvider>
      </ErrorBoundary>
    </SidebarProvider>
  );
}

const NewChatButton = ({ onNewChat }: { onNewChat: () => void }) => {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5 rounded-full"
      aria-label="New chat"
      onClick={() => {
        onNewChat();
        router.push("/chat");
      }}
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
