"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNotesStore } from "./notes-store";

export function NotesPanel() {
  const { notes, add, update, remove } = useNotesStore();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const filtered =
    query.trim() === ""
      ? notes
      : notes.filter((note) => note.content.toLowerCase().includes(query.trim().toLowerCase()));

  const handleAdd = () => {
    if (draft.trim() === "") return;
    add(draft);
    setDraft("");
  };

  const startEdit = (id: string, content: string) => {
    setEditingId(id);
    setEditDraft(content);
  };

  const submitEdit = () => {
    if (editingId === null) return;
    update(editingId, editDraft);
    setEditingId(null);
    setEditDraft("");
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

      <ul className="space-y-2">
        {filtered.map((note) => (
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
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEdit(note.id, note.content)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => remove(note.id)}
                  >
                    Delete
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="text-muted-foreground text-sm">No notes yet.</p>
      )}
    </div>
  );
}
