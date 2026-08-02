"use client";

import { useState } from "react";
import {
  ArchiveRestoreIcon,
  CheckIcon,
  ChevronRightIcon,
  GitBranchIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button";
import { cn } from "@/lib/utils";
import type { MessageNode, ThreadView } from "./conversation-machine";
import { getMessageText } from "@emi/core/web";

interface ThreadNavigationProps {
  threads: ThreadView[];
  focusedThreadId: string | null;
  searchQuery: string;
  searchResults: MessageNode[];
  onFocus: (threadId: string | null) => void;
  onSearch: (query: string) => void;
  onRename: (threadId: string, title: string) => void;
  onPin: (threadId: string, pinned: boolean) => void;
  onDiscard: (threadId: string) => void;
  onRestore: (threadId: string) => void;
}

const threadTitle = ({ thread }: { thread: ThreadView }) =>
  thread.title?.trim() || `Branch from ${new Date(thread.createdAt).toLocaleString()}`;

const findThreadForMessage = ({
  threads,
  messageId,
}: {
  threads: ThreadView[];
  messageId: string;
}) => threads.find((thread) => thread.messageIds.includes(messageId));

const ThreadMenu = ({
  thread,
  title,
  onRename,
  onPin,
  onDiscard,
}: {
  thread: ThreadView;
  title: string;
  onRename: () => void;
  onPin: () => void;
  onDiscard: () => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <TooltipIconButton
        tooltip={`Actions for ${title}`}
        side="bottom"
        className="size-7 shrink-0 rounded-full"
      >
        <MoreHorizontalIcon className="size-3.5" />
      </TooltipIconButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={onRename}>
        <PencilIcon /> Rename
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onPin}>
        <PinIcon /> {thread.pinned ? "Unpin" : "Pin"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-destructive" onClick={onDiscard}>
        <Trash2Icon /> Discard branch
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export const ThreadNavigation = ({
  threads,
  focusedThreadId,
  searchQuery,
  searchResults,
  onFocus,
  onSearch,
  onRename,
  onPin,
  onDiscard,
  onRestore,
}: ThreadNavigationProps) => {
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const visibleThreads = threads.filter((thread) => thread.status !== "discarded");
  const discardedThreads = threads.filter((thread) => thread.status === "discarded");

  const beginRename = ({ thread, title }: { thread: ThreadView; title: string }) => {
    setRenamingThreadId(thread.id);
    setRenameDraft(title);
  };

  const submitRename = () => {
    if (renamingThreadId === null || renameDraft.trim() === "") return;
    onRename(renamingThreadId, renameDraft.trim());
    setRenamingThreadId(null);
  };

  if (threads.length === 0) return null;

  return (
    <div className="relative border-b bg-background/80 px-3 py-1.5 backdrop-blur-xl md:px-5">
      <div className="mx-auto max-w-4xl">
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
          <Button
            type="button"
            size="sm"
            variant={focusedThreadId === null ? "secondary" : "ghost"}
            className="h-8 shrink-0 rounded-full px-3"
            onClick={() => onFocus(null)}
          >
            Main
          </Button>
          {visibleThreads.map((thread) => {
            const title = threadTitle({ thread });
            const isActive = focusedThreadId === thread.id;
            return (
              <div key={thread.id} className="flex shrink-0 items-center">
                <ChevronRightIcon className="size-3.5 text-muted-foreground/60" />
                <div
                  className={cn(
                    "flex h-8 items-center rounded-full border border-transparent ps-1",
                    isActive && "border-border bg-secondary shadow-xs",
                  )}
                >
                  {renamingThreadId === thread.id ? (
                    <form
                      className="flex items-center gap-0.5 ps-1"
                      onSubmit={(event) => {
                        event.preventDefault();
                        submitRename();
                      }}
                    >
                      <input
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setRenamingThreadId(null);
                        }}
                        className="w-32 bg-transparent px-1 text-sm outline-none"
                        aria-label="Branch title"
                        autoFocus
                      />
                      <TooltipIconButton tooltip="Save branch title" type="submit">
                        <CheckIcon className="size-3.5" />
                      </TooltipIconButton>
                      <TooltipIconButton
                        tooltip="Cancel rename"
                        type="button"
                        onClick={() => setRenamingThreadId(null)}
                      >
                        <XIcon className="size-3.5" />
                      </TooltipIconButton>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onFocus(thread.id)}
                        className="flex max-w-48 items-center gap-1.5 truncate px-2 text-sm"
                      >
                        <GitBranchIcon className="size-3.5 shrink-0" />
                        <span className="truncate">{title}</span>
                        {Boolean(thread.pinned) && <PinIcon className="size-3 fill-current" />}
                      </button>
                      <ThreadMenu
                        thread={thread}
                        title={title}
                        onRename={() => beginRename({ thread, title })}
                        onPin={() => onPin(thread.id, !thread.pinned)}
                        onDiscard={() => onDiscard(thread.id)}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <div className="ms-auto flex shrink-0 items-center gap-1 ps-2">
            {searchOpen ? (
              <label className="relative w-56 sm:w-64">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(event) => onSearch(event.target.value)}
                  placeholder="Search this conversation"
                  aria-label="Search this conversation"
                  className="h-8 w-full rounded-full border bg-muted/30 ps-8 pe-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen(false);
                    onSearch("");
                  }}
                  aria-label="Close conversation search"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3.5" />
                </button>
              </label>
            ) : (
              <TooltipIconButton
                tooltip="Search conversation"
                side="bottom"
                onClick={() => setSearchOpen(true)}
              >
                <SearchIcon className="size-4" />
              </TooltipIconButton>
            )}
            {discardedThreads.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full">
                    <ArchiveRestoreIcon className="size-3.5" /> Restore
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {discardedThreads.map((thread) => (
                    <DropdownMenuItem key={thread.id} onClick={() => onRestore(thread.id)}>
                      <ArchiveRestoreIcon /> {threadTitle({ thread })}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {searchQuery.trim() !== "" && (
          <div className="absolute top-full right-3 z-30 mt-1 max-h-64 w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-popover p-1 shadow-xl md:right-5">
            {searchResults.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No matching messages.</p>
            ) : (
              searchResults.map((message) => {
                const resultThread = findThreadForMessage({
                  threads: visibleThreads,
                  messageId: message.id,
                });
                const branch =
                  resultThread === undefined
                    ? "Main"
                    : `Main › ${threadTitle({ thread: resultThread })}`;
                return (
                  <button
                    key={message.id}
                    type="button"
                    className="block w-full rounded-lg px-3 py-2 text-left hover:bg-muted"
                    onClick={() => {
                      onFocus(resultThread?.id ?? null);
                      onSearch("");
                      requestAnimationFrame(() =>
                        document.getElementById(`message-${message.id}`)?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        }),
                      );
                    }}
                  >
                    <span className="block text-xs font-medium text-muted-foreground">
                      {branch}
                    </span>
                    <span className="line-clamp-2 text-sm">{getMessageText(message)}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
