"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createNote, deleteNote, fetchNotes, updateNote, type Note } from "./notes";

export function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetchNotes(query || undefined)
      .then(setNotes)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (draft.trim() === "") return;
    try {
      await createNote(draft.trim());
      setDraft("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditDraft(note.content);
  };

  const submitEdit = async () => {
    if (editingId === null || editDraft.trim() === "") return;
    try {
      await updateNote(editingId, editDraft.trim());
      setEditingId(null);
      setEditDraft("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNote(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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
            if (e.key === "Enter") handleAdd();
          }}
        />
        <Button onClick={handleAdd}>Add</Button>
      </div>

      <Input
        placeholder="Search notes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4"
      />

      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error !== null && <p className="text-destructive text-sm">{error}</p>}

      <ul className="space-y-2">
        {notes.map((note) => (
          <li key={note.id} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
            {editingId === note.id ? (
              <div className="flex flex-1 gap-2">
                <Input
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitEdit();
                    if (e.key === "Escape") {
                      setEditingId(null);
                      setEditDraft("");
                    }
                  }}
                  autoFocus
                />
                <Button size="sm" onClick={submitEdit}>
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
                    onClick={() => handleDelete(note.id)}
                  >
                    Delete
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {!loading && notes.length === 0 && (
        <p className="text-muted-foreground text-sm">No notes yet.</p>
      )}
    </div>
  );
}
