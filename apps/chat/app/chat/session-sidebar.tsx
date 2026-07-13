"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createThread, deleteThread, fetchThreads, renameThread, type Thread } from "../sessions";

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

export const SessionSidebar = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("id");

  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const load = () => {
    fetchThreads(search || undefined)
      .then(setThreads)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [search]);

  const handleNew = async () => {
    const id = await createThread();
    router.push(`/chat?id=${id}`);
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

  return (
    <aside className="flex w-64 flex-col border-r bg-muted/30">
      <div className="border-b p-3">
        <button
          onClick={handleNew}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          New chat
        </button>
      </div>

      <div className="p-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sessions…"
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3 pt-0">
        {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {error !== null && <p className="text-destructive text-sm">{error}</p>}

        {!loading && threads.length === 0 && (
          <p className="text-muted-foreground text-sm">No sessions yet.</p>
        )}

        <div className="space-y-1">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className={`group rounded-md ${activeId === thread.id ? "bg-muted" : "hover:bg-muted/70"}`}
            >
              {editingId === thread.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitRename(thread.id);
                  }}
                  className="flex items-center gap-1 p-2"
                >
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                    className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                  />
                </form>
              ) : (
                <a href={`/chat?id=${thread.id}`} className="flex items-center justify-between p-2">
                  <span className="line-clamp-1 flex-1 text-sm">{thread.title ?? "New chat"}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatDate(thread.updated_at)}
                  </span>
                </a>
              )}

              {editingId !== thread.id && (
                <div className="flex gap-2 px-2 pb-2 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => startRename(thread)}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => void handleDelete(thread.id)}
                    className="text-destructive hover:text-destructive/80 text-xs"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};
