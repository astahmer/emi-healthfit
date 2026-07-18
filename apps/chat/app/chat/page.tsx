import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMachine } from "@xstate/react";
import type { UIMessage } from "ai";
import { ErrorBoundary } from "@/components/error-boundary";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { ComposerControls } from "@/components/chat/thread";
import { ChatProviders } from "../providers";
import { useSettings } from "../settings-store";
import type { MessageWithUsage, Thread as SessionThread } from "../sessions";
import { UsageProvider } from "../usage-context";
import { useActionFeedback } from "../action-feedback";
import { compactConversation } from "../conversations";
import { chatModels } from "../models";
import type { ChatSearch } from "../router";
import { composerConfigMachine } from "./composer-config-machine";
import type { MessageNode } from "./conversation-machine";
import { conversationMarkdown } from "./conversation-markdown";
import { getConversationViewMessages } from "./conversation-tree";
import { ChatPageContent } from "./chat-page-content";
import { ChatPageHeader } from "./chat-page-header";
import { SessionSidebar } from "./session-sidebar";
import { useConversationMachine } from "./use-conversation-machine";

const HEADER_HEIGHT = 56;

type RuntimeMessage = MessageNode & { role: UIMessage["role"] };

const isRuntimeMessage = (message: MessageNode): message is RuntimeMessage =>
  message.role === "user" || message.role === "assistant";

const sidebarStyle: CSSProperties & { "--sidebar-top": string } = {
  "--sidebar-top": `${HEADER_HEIGHT}px`,
};

const emptySearch: ChatSearch = {};

const noNavigation = () => {};

const noSearchChange = () => {};

const toRuntimeMessages = (messages: MessageNode[]): UIMessage[] =>
  messages.reduce<UIMessage[]>((runtimeMessages, message) => {
    if (isRuntimeMessage(message)) {
      runtimeMessages.push({
        id: message.id,
        role: message.role,
        parts: message.parts,
      });
    }
    return runtimeMessages;
  }, []);

const toUsageMessages = (messages: MessageNode[]): MessageWithUsage[] =>
  messages.filter(isRuntimeMessage).map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts,
    createdAt: message.createdAt,
    model: message.model,
    usage: message.usage,
  }));

const compactedSummary = (messages: MessageNode[]): string | undefined => {
  const summary = messages.findLast((message) => message.role === "summary");
  if (summary === undefined) return undefined;
  const text = summary.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
  if (text === "") return undefined;
  return text.replace(
    /^Use this compacted summary of the previous conversation as context:\s*/i,
    "",
  );
};

export const ChatPage = ({
  onNavigate = noNavigation,
  onSearchChange = noSearchChange,
  search = emptySearch,
  sessionId = undefined,
}: {
  onNavigate?: (sessionId: string | undefined) => void;
  onSearchChange?: (search: Partial<ChatSearch>) => void;
  search?: ChatSearch;
  sessionId?: string;
}) => {
  const settings = useSettings((state) => state.settings);
  const updateSettings = useSettings((state) => state.update);
  const queryClient = useQueryClient();
  const feedback = useActionFeedback();
  const previousBranchCountRef = useRef<number | undefined>(undefined);
  const [isCompacting, setIsCompacting] = useState(false);
  const urlModel = search.model ?? settings.model;
  const urlCoachMode = search.coach === undefined ? settings.coachMode : true;
  const urlWebSearch = search.web === "1";
  const { state: conversationState, send: sendConversation } = useConversationMachine(sessionId);
  const [configState, sendConfig] = useMachine(composerConfigMachine, {
    input: {
      models: chatModels,
      model: urlModel,
      coachMode: urlCoachMode,
      webSearch: urlWebSearch,
    },
  });
  const activeConversationId = sessionId;
  const selectedModel = chatModels.find((model) => model.id === configState.context.model);
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
  const hasOpenAiKey = settings.apiKey.trim() !== "";
  const runtimeMessages = toRuntimeMessages(initialMessages);
  const usageMessages = toUsageMessages(initialMessages);
  const contextSummary = compactedSummary(initialMessages);

  useEffect(() => {
    if (conversation === null) return;
    queryClient.setQueriesData<SessionThread[]>({ queryKey: ["threads"] }, (threads) =>
      threads?.map((thread) =>
        thread.id === conversation.id ? { ...thread, title: conversation.title } : thread,
      ),
    );
  }, [conversation, queryClient]);

  useEffect(() => {
    if (!historyMatchesSelection || isLoading) {
      previousBranchCountRef.current = undefined;
      return;
    }
    const branchCount = conversationState.context.threads.length;
    if (
      previousBranchCountRef.current !== undefined &&
      branchCount > previousBranchCountRef.current
    ) {
      feedback.show({ kind: "success", message: "Branch created." });
    }
    previousBranchCountRef.current = branchCount;
  }, [conversationState.context.threads.length, feedback, historyMatchesSelection, isLoading]);

  const copyConversation = async () => {
    try {
      await navigator.clipboard.writeText(conversationMarkdown(conversationState.context.messages));
      feedback.show({ kind: "success", message: "Conversation copied as Markdown." });
    } catch {
      feedback.show({ kind: "error", message: "Could not copy conversation." });
    }
  };

  const startCompactedConversation = async () => {
    if (activeConversationId === undefined || isCompacting) return;
    setIsCompacting(true);
    feedback.show({ kind: "info", message: "Compacting conversation…" });
    try {
      const compactedConversation = await compactConversation({
        conversationId: activeConversationId,
        config: {
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl || undefined,
          model: configState.context.model,
        },
      });
      onNavigate(compactedConversation.id);
      feedback.show({ kind: "success", message: "Fresh chat ready with compacted context." });
    } catch {
      feedback.show({ kind: "error", message: "Could not compact conversation." });
    } finally {
      setIsCompacting(false);
    }
  };

  const composerControls: ComposerControls = {
    model: configState.context.model,
    onModelChange: (model) => {
      sendConfig({ type: "model.select", model });
      onSearchChange({ model: model === settings.model ? undefined : model });
    },
    coachMode: configState.context.coachMode,
    onCoachModeChange: () => {
      sendConfig({ type: "coach.toggle" });
      onSearchChange({ coach: configState.context.coachMode ? undefined : "1" });
    },
    webSearch: configState.context.webSearch,
    onWebSearchChange: (value) => {
      sendConfig({ type: "web.toggle", value });
      onSearchChange({ web: value ? "1" : undefined });
    },
    temporary: configState.context.temporary,
    onTemporaryChange: (value) => {
      sendConfig({ type: "temporary.toggle", value });
      sendConversation({ type: "temporary.changed", isTemporary: value });
      if (value && activeConversationId !== undefined) onNavigate(undefined);
    },
    models: chatModels,
    canWebSearch,
  };

  return (
    <SidebarProvider
      className="flex h-full min-w-0 overflow-hidden"
      defaultWidth={conversationState.context.sidebarWidth}
      onWidthChange={(width) => sendConversation({ type: "sidebar.widthChanged", width })}
      style={sidebarStyle}
    >
      <SessionSidebar />
      <ErrorBoundary onReset={() => sendConversation({ type: "reset" })}>
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
              onNavigate(id);
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
            <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
              <ChatPageHeader
                activeConversationId={activeConversationId}
                conversation={conversation}
                isRenaming={isRenaming}
                renameDraft={conversationState.context.renameDraft}
                threads={conversationState.context.threads}
                focusedThreadId={conversationState.context.focusedThreadId}
                searchQuery={conversationState.context.searchQuery}
                searchResults={conversationState.context.searchResults}
                temporary={configState.context.temporary}
                hasOpenAiKey={hasOpenAiKey}
                isCompacting={isCompacting}
                onRenameStart={() => sendConversation({ type: "conversation.rename.start" })}
                onRenameChange={(value) =>
                  sendConversation({ type: "conversation.rename.change", value })
                }
                onRenameSubmit={() => sendConversation({ type: "conversation.rename.submit" })}
                onRenameCancel={() => sendConversation({ type: "conversation.rename.cancel" })}
                onNewChat={() => onNavigate(undefined)}
                onCopyConversation={() => void copyConversation()}
                onExportConversation={() => {
                  sendConversation({ type: "export" });
                  feedback.show({ kind: "success", message: "Markdown download started." });
                }}
                onCompactConversation={() => void startCompactedConversation()}
                onFocusThread={(threadId) => sendConversation({ type: "thread.focus", threadId })}
                onSearchThreads={(query) => sendConversation({ type: "search.query", query })}
                onRenameThread={(threadId, title) =>
                  sendConversation({ type: "thread.rename", threadId, title })
                }
                onPinThread={(threadId, pinned) =>
                  sendConversation({ type: "thread.pin", threadId, pinned })
                }
                onDiscardThread={(threadId) =>
                  sendConversation({ type: "thread.discard", threadId })
                }
                onRestoreThread={(threadId) =>
                  sendConversation({ type: "thread.restore", threadId })
                }
              />
              <ChatPageContent
                activeConversationId={activeConversationId}
                isLoading={isLoading}
                hasOpenAiKey={hasOpenAiKey}
                contextSummary={contextSummary}
                composerControls={composerControls}
                loadError={loadError}
                onForkMessage={(messageId) => {
                  feedback.show({ kind: "info", message: "Creating branch…" });
                  sendConversation({ type: "thread.fork", anchorMessageId: messageId });
                }}
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
                onSaveApiKey={(apiKey) => updateSettings({ apiKey })}
                onRetry={() => sendConversation({ type: "retry" })}
              />
            </div>
          </ChatProviders>
        </UsageProvider>
      </ErrorBoundary>
    </SidebarProvider>
  );
};

export default ChatPage;
