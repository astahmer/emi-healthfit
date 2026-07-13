import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface MemoryNote {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface MemoryState {
  notes: MemoryNote[];
  add: (content: string) => void;
  update: (id: string, content: string) => void;
  remove: (id: string) => void;
  search: (query: string) => MemoryNote[];
}

const nowIso = () => new Date().toISOString();

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      notes: [],
      add: (content) => {
        const trimmed = content.trim();
        if (trimmed === "") return;
        const note: MemoryNote = {
          id: crypto.randomUUID(),
          content: trimmed,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        set((state) => ({ notes: [note, ...state.notes] }));
      },
      update: (id, content) => {
        const trimmed = content.trim();
        if (trimmed === "") return;
        set((state) => ({
          notes: state.notes.map((note) =>
            note.id === id ? { ...note, content: trimmed, updatedAt: nowIso() } : note,
          ),
        }));
      },
      remove: (id) => {
        set((state) => ({ notes: state.notes.filter((note) => note.id !== id) }));
      },
      search: (query) => {
        const term = query.trim().toLowerCase();
        const notes = get().notes;
        if (term === "") return notes;
        return notes.filter((note) => note.content.toLowerCase().includes(term));
      },
    }),
    { name: "emi-chat-memory" },
  ),
);

export const buildMemoryContext = (notes: MemoryNote[]): string => {
  if (notes.length === 0) return "";
  const lines = notes.map((note) => `- ${note.content}`).join("\n");
  return `The following notes are remembered from previous conversations:\n${lines}`;
};
