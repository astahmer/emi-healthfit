"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createMemory, deleteMemory, fetchMemories, type Memory } from "./memories";

export function MemoryPanel() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");

  const load = () => {
    setLoading(true);
    fetchMemories(search || undefined)
      .then(setMemories)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [search]);

  const handleAdd = async () => {
    if (draft.trim() === "") return;
    try {
      await createMemory(draft.trim(), "manual");
      setDraft("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMemory(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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
            if (e.key === "Enter") handleAdd();
          }}
        />
        <Button onClick={handleAdd}>Save</Button>
      </div>

      <Input
        placeholder="Search memories…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4"
      />

      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error !== null && <p className="text-destructive text-sm">{error}</p>}

      <ul className="space-y-2">
        {memories.map((memory) => (
          <li key={memory.id} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
            <span className="flex-1 whitespace-pre-wrap">{memory.content}</span>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => handleDelete(memory.id)}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>

      {!loading && memories.length === 0 && (
        <p className="text-muted-foreground text-sm">No memories yet.</p>
      )}
    </div>
  );
}
