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
  SparklesIcon,
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
import { getMessageText } from "./conversation-tree";

interface ThreadNavigationProps {
  threads: ThreadView[];
  messages: MessageNode[];
  focusedThreadId: string | null;
  searchQuery: string;
  searchResults: MessageNode[];
  onFocus: (threadId: string | null) => void;
  onSearch: (query: string) => void;
  onRename: (threadId: string, title: string) => void;
  onPin: (threadId: string, pinned: boolean) => void;
  onDiscard: (threadId: string) => void;
  onRestore: (threadId: string) => void;
  onSummarize: (threadId: string) => void;
}

const threadTitle = ({ thread, index }: { thread: ThreadView; index: number }) =>
  thread.title?.trim() || `Branch ${index + 1}`;

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
  onSummarize,
}: {
  thread: ThreadView;
  title: string;
  onRename: () => void;
  onPin: () => void;
  onDiscard: () => void;
  onSummarize: () => void;
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
      <DropdownMenuItem onClick={onSummarize}>
        <SparklesIcon /> Summarize
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
  messages,
  focusedThreadId,
  searchQuery,
  searchResults,
  onFocus,
  onSearch,
  onRename,
  onPin,
  onDiscard,
  onRestore,
  onSummarize,
}: ThreadNavigationProps) => {
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const visibleThreads = threads.filter((thread) => thread.status !== "discarded");
  const discardedThreads = threads.filter((thread) => thread.status === "discarded");
  const pinnedThreads = visibleThreads.filter((thread) => thread.pinned);

  const beginRename = ({ thread, title }: { thread: ThreadView; title: string }) => {
    setRenamingThreadId(thread.id);
    setRenameDraft(title);
  };

  const submitRename = () => {
    if (renamingThreadId === null || renameDraft.trim() === "") return;
    onRename(renamingThreadId, renameDraft.trim());
    setRenamingThreadId(null);
  };

  return (
    <div className="border-b bg-background/80 px-3 py-2 backdrop-blur-xl md:px-5">
      <div className="mx-auto flex max-w-5xl flex-col gap-2">
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5">
          <Button
            type="button"
            size="sm"
            variant={focusedThreadId === null ? "secondary" : "ghost"}
            className="h-8 shrink-0 rounded-full px-3"
            onClick={() => onFocus(null)}
          >
            Main
          </Button>
          {visibleThreads.map((thread, index) => {
            const title = threadTitle({ thread, index });
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
                        {thread.pinned && <PinIcon className="size-3 fill-current" />}
                      </button>
                      <ThreadMenu
                        thread={thread}
                        title={title}
                        onRename={() => beginRename({ thread, title })}
                        onPin={() => onPin(thread.id, !thread.pinned)}
                        onDiscard={() => onDiscard(thread.id)}
                        onSummarize={() => onSummarize(thread.id)}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {(threads.length > 0 || messages.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {pinnedThreads.length > 0 && (
              <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <PinIcon className="size-3.5 fill-current" />
                {pinnedThreads.map((thread, index) => (
                  <button
                    key={thread.id}
                    type="button"
                    className="max-w-36 truncate rounded-full bg-muted px-2 py-1 hover:text-foreground"
                    onClick={() => onFocus(thread.id)}
                  >
                    {threadTitle({ thread, index })}
                  </button>
                ))}
              </div>
            )}
            <label className="relative ms-auto min-w-48 flex-1 sm:max-w-72">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Search this conversation"
                aria-label="Search this conversation"
                className="h-8 w-full rounded-full border bg-muted/30 ps-8 pe-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </label>
            {discardedThreads.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full">
                    <ArchiveRestoreIcon className="size-3.5" /> Restore
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {discardedThreads.map((thread, index) => (
                    <DropdownMenuItem key={thread.id} onClick={() => onRestore(thread.id)}>
                      <ArchiveRestoreIcon /> {threadTitle({ thread, index })}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

        {searchQuery.trim() !== "" && (
          <div className="max-h-52 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
            {searchResults.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No matching messages.</p>
            ) : (
              searchResults.map((message) => {
                const resultThread = findThreadForMessage({
                  threads: visibleThreads,
                  messageId: message.id,
                });
                const resultThreadIndex = visibleThreads.findIndex(
                  (thread) => thread.id === resultThread?.id,
                );
                const branch =
                  resultThread === undefined
                    ? "Main"
                    : `Main › ${threadTitle({ thread: resultThread, index: resultThreadIndex })}`;
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
