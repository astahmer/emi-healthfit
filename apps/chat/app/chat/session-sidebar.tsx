"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
  loadCachedThreads,
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

export const SessionSidebar = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("id");
  const { setOpenMobile } = useSidebar();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const local = await loadCachedThreads(search || undefined);
      if (local.length > 0) setThreads(local);
    } catch {
      // ignore local cache errors; remote load will surface real problems
    }
    syncThreads(search || undefined)
      .then(setThreads)
      .catch((err) => {
        if (threads.length === 0) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => setLoading(false));
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const remote = await syncThreads(search || undefined);
      setThreads(remote);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    load();
  }, [search]);

  const handleNew = () => {
    setOpenMobile(false);
    router.push("/chat");
  };

  const handleSelect = (threadId: string) => {
    setOpenMobile(false);
    router.push(`/chat?id=${threadId}`);
  };

  const handleDelete = async (id: string) => {
    await deleteThread(id);
    if (activeId === id) router.push("/chat");
    load();
  };

  const startRename = (thread: Thread) => {
    setEditingId(thread.id);
    setEditTitle(thread.title ?? "");
  };

  const submitRename = async (id: string) => {
    if (editTitle.trim() !== "") {
      await renameThread(id, editTitle.trim());
    }
    setEditingId(null);
    load();
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
                <a href="/chat">
                  <PlusIcon />
                  <span>New chat</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => void handleSync()}
                tooltip="Sync sessions"
                disabled={syncing}
              >
                <RefreshCwIcon className={syncing ? "animate-spin" : undefined} />
                <span>Sync</span>
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
            />
          </div>
          {loading && <p className="px-4 text-sm text-muted-foreground">Loading…</p>}
          {error !== null && <p className="px-4 text-sm text-destructive">{error}</p>}
          {!loading && threads.length === 0 && (
            <p className="px-4 text-sm text-muted-foreground">No sessions yet.</p>
          )}
          <SidebarMenu>
            {threads.map((thread) => (
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
                    <a
                      href={`/chat?id=${thread.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        handleSelect(thread.id);
                      }}
                    >
                      <MessageSquareIcon />
                      <div className="flex min-w-0 flex-col items-start">
                        <span className="truncate">{thread.title ?? "New chat"}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <time
                              dateTime={thread.updated_at}
                              className="text-xs text-muted-foreground"
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
        </SidebarContent>
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
                setDeletingId(null);
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
