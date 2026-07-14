"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  deleteThread,
  fetchThreadMessages,
  renameThread,
  syncThreads,
  type Thread,
} from "../sessions";
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
  const orderedKeys: string[] = [];
  const ensureGroup = (key: string, label: string) => {
    if (!groups.has(key)) {
      groups.set(key, { key, label, threads: [] });
      orderedKeys.push(key);
    }
    return groups.get(key) as HistoryGroup;
  };

  for (const thread of threads) {
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

  return orderedKeys.map((key) => groups.get(key) as HistoryGroup);
};

export const SessionSidebar = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const activeId = searchParams.get("id");
  const { setOpenMobile } = useSidebar();

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const {
    data: threads = [],
    isLoading,
    isFetching,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["threads", search],
    queryFn: () => syncThreads(search || undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteThread,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["threads"] }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameThread(id, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["threads"] }),
  });

  useEffect(() => {
    const syncIfOnline = () => {
      if (navigator.onLine) void refetch();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncIfOnline();
    };
    window.addEventListener("online", syncIfOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", syncIfOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refetch]);

  const handleNew = () => {
    setOpenMobile(false);
    router.push("/chat");
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
    if (activeId === id) router.push("/chat");
    setDeletingId(null);
  };

  const startRename = (thread: Thread) => {
    setEditingId(thread.id);
    setEditTitle(thread.title ?? "");
  };

  const submitRename = async (id: string) => {
    const title = editTitle.trim();
    if (title !== "") {
      await renameMutation.mutateAsync({ id, title });
    }
    setEditingId(null);
  };

  const handleCopyMarkdown = useCallback(async (threadId: string) => {
    try {
      const { messages } = await fetchThreadMessages(threadId);
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
      await navigator.clipboard.writeText(md);
      setCopiedId(threadId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // silently fail
    }
  }, []);

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
        <SidebarContent>
          <div className="px-2 pt-2">
            <SidebarInput
              placeholder="Search by title or message…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search sessions"
            />
          </div>
          {isLoading && threads.length === 0 && (
            <p className="px-4 text-sm text-muted-foreground">Loading…</p>
          )}
          {error !== null && threads.length === 0 && (
            <p className="px-4 text-sm text-destructive">{error.message}</p>
          )}
          {threads.length === 0 && !isLoading && (
            <p className="px-4 text-sm text-muted-foreground">No sessions yet.</p>
          )}
          {groupThreads(threads).map((group) => (
            <SidebarGroup key={group.key}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.threads.map((thread) => (
                    <SidebarMenuItem key={thread.id}>
                      {editingId === thread.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void submitRename(thread.id);
                          }}
                          className="flex w-full items-center gap-1 px-2"
                        >
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            autoFocus
                            className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                          />
                        </form>
                      ) : (
                        <SidebarMenuButton
                          asChild
                          isActive={activeId === thread.id}
                          tooltip={thread.title ?? "New chat"}
                        >
                          <Link
                            href={`/chat?id=${thread.id}`}
                            onClick={() => setOpenMobile(false)}
                            onMouseEnter={() =>
                              queryClient.prefetchQuery({
                                queryKey: ["thread", thread.id],
                                queryFn: () => fetchThreadMessages(thread.id),
                              })
                            }
                          >
                            <MessageSquareIcon />
                            <div className="flex flex-1 flex-wrap items-baseline gap-x-2 overflow-hidden">
                              <span className="flex-1 truncate">{thread.title ?? "New chat"}</span>
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
                          </Link>
                        </SidebarMenuButton>
                      )}

                      {editingId !== thread.id && (
                        <DropdownMenu>
                          <SidebarMenuAction showOnHover asChild>
                            <DropdownMenuTrigger asChild>
                              <button type="button" aria-label="Session actions">
                                <MoreHorizontalIcon />
                              </button>
                            </DropdownMenuTrigger>
                          </SidebarMenuAction>
                          <DropdownMenuContent align="start" side="right">
                            <DropdownMenuItem onClick={() => alert("Coming soon")}>
                              <ShareIcon />
                              <span>Partager</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => alert("Coming soon")}>
                              <DownloadIcon />
                              <span>Télécharger</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void handleCopyMarkdown(thread.id)}>
                              {copiedId === thread.id ? <CheckIcon /> : <FileTextIcon />}
                              <span>{copiedId === thread.id ? "Copié !" : "Copier en .md"}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => startRename(thread)}>
                              <PencilIcon />
                              <span>Renommer</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => alert("Coming soon")}>
                              <PinIcon />
                              <span>Épingler</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => alert("Coming soon")}>
                              <CopyIcon />
                              <span>Cloner</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => alert("Coming soon")}>
                              <ArchiveIcon />
                              <span>Archiver</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeletingId(thread.id)}
                              className="text-destructive"
                            >
                              <Trash2Icon />
                              <span>Supprimer</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="px-3 py-2">
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

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
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
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingId) void handleDelete(deletingId);
              }}
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
