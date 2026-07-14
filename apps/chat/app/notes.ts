export interface Note {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

const apiBase = () => (typeof window === "undefined" ? "" : window.location.origin);

export const fetchNotes = async (search?: string, limit = 100): Promise<Note[]> => {
  const params = new URLSearchParams();
  if (search !== undefined && search.trim() !== "") params.set("search", search.trim());
  params.set("limit", String(limit));
  const res = await fetch(`${apiBase()}/api/notes?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load notes: ${res.status}`);
  const data = (await res.json()) as { notes: Note[] };
  return data.notes;
};

export const createNote = async (content: string): Promise<string> => {
  const res = await fetch(`${apiBase()}/api/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Failed to create note: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return data.id;
};

export const updateNote = async (id: string, content: string): Promise<void> => {
  const res = await fetch(`${apiBase()}/api/notes/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Failed to update note: ${res.status}`);
};

export const deleteNote = async (id: string): Promise<void> => {
  const res = await fetch(`${apiBase()}/api/notes/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete note: ${res.status}`);
};

export const buildNotesContext = (notes: Note[]): string => {
  if (notes.length === 0) return "";
  const lines = notes.map((note) => `- ${note.content}`).join("\n");
  return `The following notes are remembered from previous conversations:\n${lines}`;
};
