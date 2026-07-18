"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createNote, deleteNote, fetchNotes, updateNote, type Note } from "./notes";
import { notifyQueryResourceChanged, queryKeys } from "./query-cache";

export function NotesPanel() {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const {
    data: notes = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.notes.list({ search: query }),
    queryFn: () => fetchNotes(query || undefined),
  });

  const createMutation = useMutation({
    mutationFn: createNote,
    onSuccess: () => notifyQueryResourceChanged("notes"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => updateNote(id, content),
    onSuccess: () => notifyQueryResourceChanged("notes"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNote,
    onSuccess: () => notifyQueryResourceChanged("notes"),
  });

  const handleAdd = async () => {
    const content = draft.trim();
    if (content === "") return;
    await createMutation.mutateAsync(content);
    setDraft("");
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditDraft(note.content);
  };

  const submitEdit = async () => {
    if (editingId === null || editDraft.trim() === "") return;
    await updateMutation.mutateAsync({ id: editingId, content: editDraft.trim() });
    setEditingId(null);
    setEditDraft("");
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
  };

  return (
    <div className="mx-auto max-w-xl p-6">
      <h2 className="mb-4 text-xl font-semibold">Notes</h2>
      <p className="text-muted-foreground mb-4 text-sm">
        Notes you save here are automatically added to the assistant&apos;s system prompt in every
        new chat.
      </p>

      <div className="mb-4 flex gap-2">
        <Input
          placeholder="Add a note…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAdd();
          }}
        />
        <Button onClick={() => void handleAdd()} disabled={createMutation.isPending}>
          Add
        </Button>
      </div>

      <Input
        placeholder="Search notes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4"
      />

      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error !== null && <p className="text-destructive text-sm">{error.message}</p>}

      <ul className="space-y-2">
        {notes.map((note) => (
          <li key={note.id} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
            {editingId === note.id ? (
              <div className="flex flex-1 gap-2">
                <Input
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitEdit();
                    if (e.key === "Escape") {
                      setEditingId(null);
                      setEditDraft("");
                    }
                  }}
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={() => void submitEdit()}
                  disabled={updateMutation.isPending}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setEditDraft("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <span className="flex-1 whitespace-pre-wrap">{note.content}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(note)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => void handleDelete(note.id)}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {!isLoading && notes.length === 0 && (
        <p className="text-muted-foreground text-sm">No notes yet.</p>
      )}
    </div>
  );
}
