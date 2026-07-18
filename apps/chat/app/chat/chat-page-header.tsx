import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { ConversationUsage } from "../usage-context";
import { Button } from "@/components/ui/button";
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Conversation, MessageNode, ThreadView } from "./conversation-machine";
import { ThreadNavigation } from "./thread-navigation";

export const ChatPageHeader = ({
  activeConversationId,
  conversation,
  isRenaming,
  renameDraft,
  threads,
  focusedThreadId,
  searchQuery,
  searchResults,
  temporary,
  hasOpenAiKey,
  isCompacting,
  onRenameStart,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onNewChat,
  onCopyConversation,
  onExportConversation,
  onCompactConversation,
  onFocusThread,
  onSearchThreads,
  onRenameThread,
  onPinThread,
  onDiscardThread,
  onRestoreThread,
}: {
  activeConversationId: string | undefined;
  conversation: Conversation | null;
  isRenaming: boolean;
  renameDraft: string;
  threads: ThreadView[];
  focusedThreadId: string | null;
  searchQuery: string;
  searchResults: MessageNode[];
  temporary: boolean;
  hasOpenAiKey: boolean;
  isCompacting: boolean;
  onRenameStart: () => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onNewChat: () => void;
  onCopyConversation: () => void;
  onExportConversation: () => void;
  onCompactConversation: () => void;
  onFocusThread: (threadId: string | null) => void;
  onSearchThreads: (query: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onPinThread: (threadId: string, pinned: boolean) => void;
  onDiscardThread: (threadId: string) => void;
  onRestoreThread: (threadId: string) => void;
}) => {
  return (
    <>
      <div className="flex items-center gap-2 border-b px-2 py-1.5 md:px-4 md:py-2">
        <SidebarTrigger />
        {activeConversationId !== undefined && conversation !== null && (
          <>
            {isRenaming ? (
              <form
                className="flex flex-1 items-center gap-2 px-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  onRenameSubmit();
                }}
              >
                <input
                  value={renameDraft}
                  onChange={(event) => onRenameChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") onRenameCancel();
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
                  onClick={onRenameCancel}
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
                  onClick={onRenameStart}
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-full"
            aria-label="New chat"
            onClick={onNewChat}
          >
            <PlusIcon className="size-4" />
            <span className="hidden md:inline">New chat</span>
          </Button>
          {activeConversationId !== undefined && (
            <>
              <TooltipIconButton
                tooltip="Copy conversation as Markdown"
                side="bottom"
                type="button"
                variant="ghost"
                aria-label="Copy conversation as Markdown"
                onClick={onCopyConversation}
              >
                <CopyIcon className="size-4" />
              </TooltipIconButton>
              <TooltipIconButton
                tooltip="Export as Markdown"
                side="bottom"
                type="button"
                variant="ghost"
                onClick={onExportConversation}
              >
                <DownloadIcon className="size-4" />
              </TooltipIconButton>
              <TooltipIconButton
                tooltip="Compact conversation and start fresh"
                side="bottom"
                type="button"
                variant="ghost"
                aria-label="Compact conversation and start fresh"
                disabled={!hasOpenAiKey || isCompacting}
                onClick={onCompactConversation}
              >
                <SparklesIcon className={isCompacting ? "size-4 animate-pulse" : "size-4"} />
              </TooltipIconButton>
            </>
          )}
        </div>
      </div>
      {activeConversationId !== undefined && !temporary && (
        <ThreadNavigation
          key={threads.map((thread) => thread.id).join(",")}
          threads={threads}
          focusedThreadId={focusedThreadId}
          searchQuery={searchQuery}
          searchResults={searchResults}
          onFocus={onFocusThread}
          onSearch={onSearchThreads}
          onRename={onRenameThread}
          onPin={onPinThread}
          onDiscard={onDiscardThread}
          onRestore={onRestoreThread}
        />
      )}
    </>
  );
};
