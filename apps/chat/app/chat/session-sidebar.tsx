"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMachine } from "@xstate/react";
import {
  ArchiveIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FileTextIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  RefreshCwIcon,
  ShareIcon,
  Trash2Icon,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { syncConversations, type Thread } from "../sessions";
import { getCachedThreads } from "../session-cache";
import { fetchConversationMessages as fetchConversationSnapshot } from "../conversations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sidebarItemMachine } from "./sidebar-item-machine";

const formatFullDate = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const formatRelativeTime = (value: string) => {
  const date = new Date(value);
  const now = new Date();
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
};

const downloadDiagnostics = async ({ conversationId }: { conversationId: string }) => {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/diagnostics`,
  );
  if (!response.ok) throw new Error(`Diagnostics export failed: ${response.status}`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${conversationId}-diagnostics.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

type HistoryGroup = { key: string; label: string; threads: Thread[] };

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getDaysAgo = (value: string) => {
  const date = startOfDay(new Date(value));
  const today = startOfDay(new Date());
  const diff = today.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const groupThreads = (threads: Thread[]): HistoryGroup[] => {
  const groups = new Map<string, HistoryGroup>();
  const ensureGroup = (key: string, label: string) => {
    const existing = groups.get(key);
    if (existing !== undefined) return existing;
    const group: HistoryGroup = { key, label, threads: [] };
    groups.set(key, group);
    return group;
  };

  const regular = threads.filter((candidate) => candidate.status === "regular");
  const pinned = regular.filter((thread) => thread.pinned);
  if (pinned.length > 0) {
    groups.set("pinned", { key: "pinned", label: "Pinned", threads: pinned });
  }

  for (const thread of regular.filter((candidate) => !candidate.pinned)) {
    const daysAgo = getDaysAgo(thread.updated_at);
    if (daysAgo <= 0) {
      ensureGroup("today", "Today").threads.push(thread);
    } else if (daysAgo === 1) {
      ensureGroup("yesterday", "Yesterday").threads.push(thread);
    } else if (daysAgo < 7) {
      ensureGroup("last7", "Last 7 days").threads.push(thread);
    } else if (daysAgo < 30) {
      ensureGroup("last30", "Last 30 days").threads.push(thread);
    } else {
      ensureGroup("older", "Older").threads.push(thread);
    }
  }

  const archived = threads.filter((thread) => thread.status === "archived");
  if (archived.length > 0)
    groups.set("archived", { key: "archived", label: "Archived", threads: archived });

  return Array.from(groups.values());
};

interface SidebarItemProps {
  thread: Thread;
  isActive: boolean;
  onDeleted: () => void;
  onChanged: () => void;
  onCloned: (threadId: string) => void;
}

const SidebarItem = ({ thread, isActive, onDeleted, onChanged, onCloned }: SidebarItemProps) => {
  const queryClient = useQueryClient();
  const { setOpenMobile } = useSidebar();
  const [state, send] = useMachine(sidebarItemMachine, {
    input: {
      thread,
      onRenamed: () => {
        void queryClient.invalidateQueries({ queryKey: ["threads"] });
        void queryClient.invalidateQueries({ queryKey: ["thread", thread.id] });
      },
      onDeleted,
      onChanged,
      onCloned,
    },
  });

  const title = state.context.thread.title ?? "New chat";
  const isRenaming = state.matches("renaming") || state.matches("submittingRename");
  const isDeleting = state.matches("confirmingDelete") || state.matches("deleting");

  useEffect(() => {
    send({ type: "thread.changed", thread });
  }, [send, thread]);

  return (
    <>
      <SidebarMenuItem>
        {isRenaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send({ type: "rename.submit" });
            }}
            className="flex w-full items-center gap-1 px-2"
          >
            <input
              value={state.context.draft}
              onChange={(e) => send({ type: "rename.change", value: e.target.value })}
              autoFocus
              className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
            />
            {state.context.error !== null && (
              <span className="text-xs text-destructive">{state.context.error}</span>
            )}
          </form>
        ) : (
          <SidebarMenuButton asChild isActive={isActive} tooltip={title}>
            <a
              href={`/chat/${encodeURIComponent(thread.id)}`}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                event.preventDefault();
                setOpenMobile(false);
                window.history.pushState(null, "", event.currentTarget.href);
              }}
              onPointerDown={() =>
                queryClient.prefetchQuery({
                  queryKey: ["conversation", thread.id],
                  queryFn: () => fetchConversationSnapshot(thread.id),
                  staleTime: 30_000,
                })
              }
              onMouseEnter={() =>
                queryClient.prefetchQuery({
                  queryKey: ["conversation", thread.id],
                  queryFn: () => fetchConversationSnapshot(thread.id),
                  staleTime: 30_000,
                })
              }
            >
              <MessageSquareIcon />
              {Boolean(thread.pinned) && (
                <PinIcon className="size-3 fill-current" aria-label="Pinned" />
              )}
              <div className="flex flex-1 flex-wrap items-baseline gap-x-2 overflow-hidden">
                <span className="flex-1 truncate">{title}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <time
                      dateTime={thread.updated_at}
                      className="text-xs whitespace-nowrap text-muted-foreground"
                    >
                      {formatRelativeTime(thread.updated_at)}
                    </time>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{formatFullDate(thread.updated_at)}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </a>
          </SidebarMenuButton>
        )}

        {!isRenaming && !isDeleting && (
          <DropdownMenu>
            <SidebarMenuAction showOnHover asChild>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Session actions">
                  <MoreHorizontalIcon />
                </button>
              </DropdownMenuTrigger>
            </SidebarMenuAction>
            <DropdownMenuContent align="start" side="right">
              <DropdownMenuItem onClick={() => send({ type: "share" })}>
                <ShareIcon />
                <span>Partager</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => send({ type: "download" })}>
                <DownloadIcon />
                <span>Télécharger</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void downloadDiagnostics({ conversationId: thread.id })}
              >
                <DownloadIcon />
                <span>Exporter les diagnostics</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => send({ type: "copy.markdown" })}>
                {state.context.copiedId === thread.id ? <CheckIcon /> : <FileTextIcon />}
                <span>{state.context.copiedId === thread.id ? "Copié !" : "Copier en .md"}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => send({ type: "rename.start" })}>
                <PencilIcon />
                <span>Renommer</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => send({ type: "pin.toggle" })}>
                <PinIcon />
                <span>{thread.pinned ? "Désépingler" : "Épingler"}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => send({ type: "clone" })}>
                <CopyIcon />
                <span>Cloner</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => send({ type: thread.status === "archived" ? "restore" : "archive" })}
              >
                <ArchiveIcon />
                <span>{thread.status === "archived" ? "Restaurer" : "Archiver"}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => send({ type: "delete.request" })}
                className="text-destructive"
              >
                <Trash2Icon />
                <span>Supprimer</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarMenuItem>

      <AlertDialog
        open={isDeleting}
        onOpenChange={(open) => {
          if (!open) send({ type: "delete.cancel" });
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette session ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Toutes les messages de cette session seront supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => send({ type: "delete.cancel" })}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => send({ type: "delete.confirm" })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const SessionSidebar = ({ onNewChat }: { onNewChat?: () => void }) => {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const encodedActiveId = pathname.match(/^\/chat\/([^/]+)\/?$/)?.[1];
  const activeId = encodedActiveId === undefined ? undefined : decodeURIComponent(encodedActiveId);
  const { setOpenMobile } = useSidebar();

  const [search, setSearch] = useState("");

  const {
    data: threads = [],
    isFetching,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["threads", search],
    queryFn: async () => {
      const querySearch = search || undefined;
      const cached = await getCachedThreads(querySearch);
      if (cached.length === 0) return syncConversations(querySearch);
      void syncConversations(querySearch)
        .then((fresh) => queryClient.setQueryData(["threads", search], fresh))
        .catch(() => undefined);
      return cached;
    },
    staleTime: 30_000,
    gcTime: 86_400_000,
  });

  const handleNew = () => {
    setOpenMobile(false);
    onNewChat?.();
    router.push("/chat");
  };

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild onClick={handleNew} tooltip="New chat">
                <Link href="/chat">
                  <PlusIcon />
                  <span>New chat</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="overscroll-contain pb-2">
          <div className="px-2 pt-2">
            <SidebarInput
              placeholder="Search by title or message…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search sessions"
            />
          </div>
          {error !== null && threads.length === 0 && (
            <p className="px-4 text-sm text-destructive">{error.message}</p>
          )}
          {threads.length === 0 && !isFetching && error === null && (
            <p className="px-4 text-sm text-muted-foreground">No sessions yet.</p>
          )}
          {groupThreads(threads).map((group) => (
            <SidebarGroup key={group.key}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.threads.map((thread) => (
                    <SidebarItem
                      key={thread.id}
                      thread={thread}
                      isActive={activeId === thread.id}
                      onDeleted={() => {
                        if (activeId === thread.id) router.push("/chat");
                        void queryClient.invalidateQueries({ queryKey: ["threads"] });
                      }}
                      onChanged={() =>
                        void queryClient.invalidateQueries({ queryKey: ["threads"] })
                      }
                      onCloned={(threadId) => {
                        void queryClient.invalidateQueries({ queryKey: ["threads"] });
                        router.push(`/chat/${encodeURIComponent(threadId)}`);
                      }}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="shrink-0 border-t px-3 py-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Sync sessions"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCwIcon className={isFetching ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
            <span>
              {dataUpdatedAt > 0
                ? `Synced ${formatRelativeTime(new Date(dataUpdatedAt).toISOString())}`
                : "Not synced"}
            </span>
          </button>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
    </>
  );
};
