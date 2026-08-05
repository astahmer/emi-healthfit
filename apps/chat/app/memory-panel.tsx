"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionFeedback } from "./action-feedback";
import { notifyMemoriesChanged } from "./memory-events";
import { MemoryDomain } from "./memories";
import { queryKeys } from "./query-cache";

const memorySource = (source: string | null | undefined): string => {
  if (source === "auto" || source === "assistant") return "Auto-saved from chat";
  if (source === "manual") return "Saved manually";
  if (source === "summary-edit") return "Saved from a summary edit";
  return "Saved";
};

export function MemoryPanel() {
  const feedback = useActionFeedback();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");

  const {
    data: memories = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.memories.list({ search }),
    queryFn: () => MemoryDomain.list({ search: search || undefined }),
  });

  const { data: deletedMemories = [], isLoading: deletedLoading } = useQuery({
    queryKey: queryKeys.memories.deleted,
    queryFn: () => MemoryDomain.list({ deleted: true }),
  });

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useQuery({
    queryKey: queryKeys.memories.summary,
    queryFn: () => MemoryDomain.summary(),
  });

  const createMutation = useMutation({
    mutationFn: (content: string) => MemoryDomain.create({ content, source: "manual" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.memories.all });
      notifyMemoriesChanged();
      feedback.show({ kind: "success", message: "Memory saved." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => MemoryDomain.remove({ id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.memories.all });
      notifyMemoriesChanged();
      feedback.show({ kind: "success", message: "Memory removed." });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => MemoryDomain.restore({ id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.memories.all });
      notifyMemoriesChanged();
      feedback.show({ kind: "success", message: "Memory restored." });
    },
  });

  const [summaryDraft, setSummaryDraft] = useState<string | undefined>();
  const summaryContent = summaryDraft ?? summary?.content ?? "";
  const summaryMutation = useMutation({
    mutationFn: (content: string) => MemoryDomain.updateSummary({ content }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.memories.summary });
      setSummaryDraft(undefined);
      notifyMemoriesChanged();
      feedback.show({ kind: "success", message: "Memory summary saved." });
    },
    onError: () => feedback.show({ kind: "error", message: "Could not save the memory summary." }),
  });

  const handleAdd = async () => {
    const content = draft.trim();
    if (content === "") return;
    try {
      await createMutation.mutateAsync(content);
      setDraft("");
    } catch {}
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync({ id });
    } catch {}
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreMutation.mutateAsync({ id });
    } catch {}
  };

  const handleSaveSummary = async () => {
    const content = summaryContent.trim();
    if (content === "") return;
    try {
      await summaryMutation.mutateAsync(content);
    } catch {}
  };

  return (
    <div className="mx-auto max-w-xl p-6">
      <h2 className="mb-4 text-xl font-semibold">Memory</h2>
      <p className="text-muted-foreground mb-4 text-sm">
        The assistant searches this merged summary first, then the source memories when it needs
        more detail.
      </p>

      <section className="mb-6 rounded-lg border p-4">
        <h3 className="mb-2 font-medium">Merged memory summary</h3>
        <p className="text-muted-foreground mb-3 text-sm">
          A concise view of what the assistant remembers about you. Edit it when the summary needs
          correction; source memories remain below.
        </p>
        <textarea
          aria-label="Merged memory summary"
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-28 w-full rounded-md border px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1"
          disabled={summaryLoading || summaryMutation.isPending}
          onChange={(event) => setSummaryDraft(event.target.value)}
          placeholder="No merged summary yet"
          value={summaryContent}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            {summary === undefined
              ? "No summary has been saved yet."
              : `${summary.memory_count} source ${summary.memory_count === 1 ? "memory" : "memories"} · updated ${new Date(summary.updated_at).toLocaleString()}`}
          </p>
          <Button
            disabled={summaryContent.trim() === "" || summaryMutation.isPending}
            onClick={() => void handleSaveSummary()}
          >
            Save summary
          </Button>
        </div>
        {summaryError !== null && (
          <p className="text-destructive mt-2 text-sm">{summaryError.message}</p>
        )}
      </section>

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
          const provenance = MemoryDomain.provenance(memory);
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

      {!deletedLoading && deletedMemories.length > 0 && (
        <section aria-label="Disabled memories" className="mt-8">
          <h3 className="mb-1 font-medium">Disabled memories</h3>
          <p className="text-muted-foreground mb-3 text-sm">
            Hidden from the assistant until you restore them.
          </p>
          <ul className="space-y-2">
            {deletedMemories.map((memory) => (
              <li
                key={memory.id}
                className="border-muted bg-muted/40 flex items-start gap-2 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap">{memory.content}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {memorySource(memory.source)} · {new Date(memory.created_at).toLocaleString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleRestore(memory.id)}
                  disabled={restoreMutation.isPending}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
