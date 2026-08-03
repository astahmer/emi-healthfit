import { useMemo, useRef, type ReactNode } from "react";

import { useChatActions, useChatSelector } from "../../react-hooks.ts";
import type { Attachment } from "../../protocol/parts.ts";
import type { ChatMessage } from "../../protocol/messages.ts";
import { prepareAttachments } from "../../web/attachments/attachments.ts";
import { conversationMarkdown } from "../../web/conversation/conversation-markdown.ts";
import {
  ChatComposer,
  ChatHeader,
  FollowUpQueue,
  MessageViewport,
} from "./internal/chat-content.tsx";
import {
  ChatSidebar,
  ConversationList,
  MemoryPanel,
  SettingsPanel,
} from "./internal/chat-sidebar.tsx";
import { Button } from "./internal/ui/button.tsx";
import { SuggestionChips } from "../../web/thread/suggestion-chips.tsx";

const emptyReleaseNotes: ReadonlyArray<string> = [];

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read the selected attachment."));
        return;
      }
      resolve(reader.result);
    });
    reader.addEventListener("error", () =>
      reject(new Error("Unable to read the selected attachment.")),
    );
    reader.readAsDataURL(file);
  });

const prepareProtocolAttachments = async ({
  files,
  existingCount,
}: {
  files: FileList;
  existingCount: number;
}): Promise<ReadonlyArray<Attachment>> => {
  const prepared = await prepareAttachments({ files, existingCount });
  return Promise.all(
    Array.from(prepared).map(async (file) => {
      const url = await readFileAsDataUrl(file);
      return {
        id: `attachment:${url}`,
        name: file.name || "Attachment",
        mediaType: file.type || "application/octet-stream",
        url,
        size: file.size,
      };
    }),
  );
};

const conversationText = (messages: ReadonlyArray<ChatMessage>) =>
  conversationMarkdown(
    messages.map((message) => ({
      ...message,
      parentId: null,
    })),
  );

const scrollMessage = ({
  messageId,
  messageElements,
}: {
  messageId: string;
  messageElements: Map<string, HTMLElement>;
}) => {
  messageElements.get(messageId)?.scrollIntoView({ behavior: "smooth", block: "center" });
};

export const ChatShell = ({ children }: { readonly children?: ReactNode }) => (
  <div className="flex min-h-0 flex-1 flex-col" data-testid="chat-shell">
    {children}
  </div>
);

export const ChatApp = ({
  appName = "Core Chat",
  description = "Generic streaming chat starter. Your provider key stays in this browser.",
  version = "0.1.0",
  releaseNotes = emptyReleaseNotes,
  children,
  slots,
}: {
  readonly appName?: string;
  readonly description?: string;
  readonly version?: string;
  readonly releaseNotes?: ReadonlyArray<string>;
  readonly children?: ReactNode;
  readonly slots?: Record<string, ReactNode>;
} = {}) => {
  const actions = useChatActions();
  const activeThread = useChatSelector((state) => state.activeThread);
  const composer = useChatSelector((state) => state.composer);
  const conversationList = useChatSelector((state) => state.conversations);
  const memories = useChatSelector((state) => state.memories.items);
  const memorySummary = useChatSelector((state) => state.memories.summary);
  const threads = useChatSelector((state) => state.threads);
  const settings = useChatSelector((state) => state.settings);
  const connection = useChatSelector((state) => state.connection);
  const temporary = useChatSelector((state) => state.temporary);
  const error = useChatSelector((state) => state.error);
  const queuedFollowUps = useChatSelector((state) => state.queuedFollowUps);
  const suggestions = useChatSelector((state) => state.suggestions);
  const { memoryDraft, memoryPanelOpen, memorySearch, memorySummaryDraft, sidebarOpen } =
    useChatSelector((state) => state.ui);
  const messageContainer = useRef<HTMLDivElement | null>(null);
  const messageElementsMap = useMemo(() => new Map<string, HTMLElement>(), []);
  const conversationId = activeThread.conversationId;
  const threadId = activeThread.id;
  const online = connection === "online";
  const streaming = activeThread.isStreaming;

  const scrollMessages = (target: "top" | "previous" | "bottom") => {
    const container = messageContainer.current;
    if (container === null) return;
    if (target === "top") {
      container.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (target === "bottom") {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      return;
    }
    const previous = activeThread.messages.toReversed().find((message) => {
      const element = messageElementsMap.get(message.id);
      return element !== undefined && element.offsetTop < container.scrollTop - 8;
    });
    if (previous !== undefined)
      scrollMessage({ messageId: previous.id, messageElements: messageElementsMap });
  };

  const addFiles = (fileList: FileList | undefined) => {
    if (fileList === undefined) return;
    void prepareProtocolAttachments({ files: fileList, existingCount: composer.attachments.length })
      .then((attachments) => actions.addAttachments({ attachments }))
      .catch((cause: unknown) =>
        actions.reportError({
          error: cause instanceof Error ? cause.message : "Unable to prepare attachments.",
        }),
      );
  };

  const content = children ?? (
    <>
      <MessageViewport
        conversationId={conversationId}
        messageContainer={messageContainer}
        messageElements={messageElementsMap}
        messages={activeThread.messages}
        onBranchMessage={(messageId) => {
          if (conversationId !== undefined && !temporary) actions.createBranch({ messageId });
        }}
        onEditMessage={({ messageId, text }) => actions.editMessage({ messageId, text })}
        onRetryMessage={(messageId) => actions.retry({ messageId })}
        onSelectMinimapMessage={(messageId) =>
          scrollMessage({ messageId, messageElements: messageElementsMap })
        }
        streaming={streaming}
        temporary={temporary}
      />
      {error !== undefined && (
        <p className="mx-auto mb-3 w-full max-w-3xl rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <FollowUpQueue
        followUps={queuedFollowUps}
        onForceSend={(followUp) => actions.forceSendQueuedFollowUp({ id: followUp.id })}
        onRemove={(id) => actions.removeQueuedFollowUp({ id })}
      />
    </>
  );

  return (
    <div
      className={`emi-chat-app flex h-dvh min-h-0 overflow-hidden bg-background text-foreground ${settings.theme === "dark" ? "dark" : ""}`}
      data-sidebar-open={sidebarOpen}
      data-theme={settings.theme}
    >
      {slots?.sidebar ?? (
        <ChatSidebar
          description="Conversation history, memories, and provider settings."
          onOpenChange={(open) => actions.setSidebarOpen({ open })}
          open={sidebarOpen}
          title={appName}
        >
          <div className="space-y-1 px-2 pt-1">
            <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              EMI CORE
            </p>
            <h1 className="text-xl font-semibold tracking-tight">{appName}</h1>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <Button
            className="w-full"
            onClick={() => actions.startNewConversation()}
            variant="outline"
          >
            New chat
          </Button>
          <ConversationList
            conversationId={conversationId}
            conversations={conversationList.items}
            onCloneConversation={(id) => actions.cloneConversation({ conversationId: id })}
            onCompactConversation={(id) => actions.compactConversation({ conversationId: id })}
            onDeleteConversation={({ conversationId: id, resetSession }) => {
              if (window.confirm("Delete this conversation permanently?"))
                actions.deleteConversation({ conversationId: id, resetSession });
            }}
            onOpenConversation={(id) => actions.selectConversation({ conversationId: id })}
            onOpenThread={(id) => actions.selectThread({ threadId: id })}
            onRenameConversation={({ conversationId: id, currentTitle }) => {
              const title = window.prompt("Conversation name", currentTitle ?? "");
              if (title !== null && title.trim() !== "")
                actions.updateConversation({ conversationId: id, title: title.trim() });
            }}
            onSearchChange={(search) => actions.setConversationSearch({ search })}
            onUpdateConversation={({ conversationId: id, patch }) =>
              actions.updateConversation({ conversationId: id, ...patch })
            }
            search={conversationList.search}
            threadId={threadId}
            threads={threads}
          />
          <MemoryPanel
            draft={memoryDraft}
            memories={memories}
            onSaveSummary={() => actions.saveMemorySummary()}
            onSummaryDraftChange={(draft) => actions.setMemorySummaryDraft({ draft })}
            onCreate={() => actions.createMemory()}
            onDelete={(id) => actions.deleteMemory({ memoryId: id })}
            onDraftChange={(draft) => actions.setMemoryDraft({ draft })}
            onOpenChange={(open) => actions.setMemoryPanelOpen({ open })}
            onSearchChange={(search) => actions.setMemorySearch({ search })}
            open={memoryPanelOpen}
            search={memorySearch}
            summary={memorySummary}
            summaryDraft={memorySummaryDraft}
          />
          <SettingsPanel
            metadata={
              temporary
                ? "Not saved"
                : conversationId === undefined
                  ? "New conversation"
                  : conversationId
            }
            onSettingsChange={(patch) => actions.updateSettings({ patch })}
            onTemporaryChange={(value) => {
              actions.setTemporary({ temporary: value });
              actions.startNewConversation();
            }}
            online={online}
            releaseNotes={releaseNotes}
            settings={settings}
            temporary={temporary}
            version={version}
          />
        </ChatSidebar>
      )}
      <main aria-label="Chat" className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {slots?.header ?? (
          <ChatHeader
            appName={appName}
            messageCount={activeThread.messages.length}
            onScroll={scrollMessages}
            onStop={() => actions.stop()}
            onCopyConversation={() => {
              void navigator.clipboard?.writeText(conversationText(activeThread.messages));
            }}
            onDownloadConversation={() => {
              const blob = new Blob([conversationText(activeThread.messages)], {
                type: "text/markdown;charset=utf-8",
              });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `chat-${conversationId ?? "temporary"}.md`;
              anchor.click();
              URL.revokeObjectURL(url);
            }}
            onShareConversation={() => {
              const text = conversationText(activeThread.messages);
              if (navigator.share !== undefined) {
                void navigator.share({ title: appName, text });
                return;
              }
              void navigator.clipboard?.writeText(text);
            }}
            onToggleSidebar={() => actions.setSidebarOpen({ open: !sidebarOpen })}
            sidebarOpen={sidebarOpen}
            streaming={streaming}
            temporary={temporary}
            threadId={threadId}
          />
        )}
        <ChatShell>
          {content}
          {slots?.composer ?? (
            <>
              <div className="mx-auto w-full max-w-3xl px-3 pb-2 md:px-4">
                <SuggestionChips
                  disabled={streaming}
                  onSelect={(suggestion) => actions.sendMessage({ text: suggestion })}
                  suggestions={suggestions.items}
                />
              </div>
              <ChatComposer
                draft={composer.text}
                files={composer.attachments}
                onDraftChange={(draft) => actions.setDraft({ text: draft })}
                onFilesSelected={addFiles}
                onRemoveFile={(file) =>
                  actions.removeAttachment({ attachmentId: `attachment:${file.url}` })
                }
                onSubmit={() => actions.sendMessage({ text: composer.text.trim() })}
                onWebSearchChange={(enabled) => actions.setWebSearch({ enabled })}
                placeholder={`Message ${appName}`}
                streaming={streaming}
                webSearch={settings.webSearch}
              />
            </>
          )}
        </ChatShell>
        {slots?.footer}
      </main>
    </div>
  );
};
