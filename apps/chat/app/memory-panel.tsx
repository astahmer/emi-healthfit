"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionFeedback } from "./action-feedback";
import { notifyMemoriesChanged } from "./memory-events";
import { createMemory, deleteMemory, fetchMemories, memoryProvenance } from "./memories";
import { queryKeys } from "./query-cache";

const memorySource = (source: string | null | undefined): string => {
  if (source === "auto" || source === "assistant") return "Auto-saved from chat";
  if (source === "manual") return "Saved manually";
  return "Saved";
};

export function MemoryPanel() {
  const feedback = useActionFeedback();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");

  const {
    data: memories = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.memories.list({ search }),
    queryFn: () => fetchMemories({ search: search || undefined }),
  });

  const createMutation = useMutation({
    mutationFn: (content: string) => createMemory(content, "manual"),
    onSuccess: () => {
      notifyMemoriesChanged();
      feedback.show({ kind: "success", message: "Memory saved." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMemory,
    onSuccess: () => {
      notifyMemoriesChanged();
      feedback.show({ kind: "success", message: "Memory removed." });
    },
  });

  const handleAdd = async () => {
    const content = draft.trim();
    if (content === "") return;
    await createMutation.mutateAsync(content);
    setDraft("");
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
  };

  return (
    <div className="mx-auto max-w-xl p-6">
      <h2 className="mb-4 text-xl font-semibold">Memory</h2>
      <p className="text-muted-foreground mb-4 text-sm">
        Saved snippets from past conversations. The assistant can search these to recall things you
        discussed before.
      </p>

      <div className="mb-4 flex gap-2">
        <Input
          placeholder="Save a memory…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAdd();
          }}
        />
        <Button onClick={() => void handleAdd()} disabled={createMutation.isPending}>
          Save
        </Button>
      </div>

      <Input
        placeholder="Search memories…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4"
      />

      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error !== null && <p className="text-destructive text-sm">{error.message}</p>}

      <ul className="space-y-2">
        {memories.map((memory) => {
          const provenance = memoryProvenance(memory);
          return (
            <li key={memory.id} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap">{memory.content}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {memorySource(provenance.source)} · {new Date(memory.created_at).toLocaleString()}
                  {provenance.conversationId !== null && provenance.messageId !== undefined && (
                    <>
                      {" · "}
                      <a
                        className="underline hover:text-foreground"
                        href={`/chat/${encodeURIComponent(provenance.conversationId)}#message-${encodeURIComponent(provenance.messageId)}`}
                      >
                        Open source message
                      </a>
                    </>
                  )}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => void handleDelete(memory.id)}
                disabled={deleteMutation.isPending}
              >
                Delete
              </Button>
            </li>
          );
        })}
      </ul>

      {!isLoading && memories.length === 0 && (
        <p className="text-muted-foreground text-sm">No memories yet.</p>
      )}
    </div>
  );
}
