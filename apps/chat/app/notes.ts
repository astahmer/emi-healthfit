import type { Note } from "@emi/core/contract";
import { runApi } from "./api-client";

export const fetchNotes = async (search?: string, limit = 100): Promise<Note[]> => {
  const normalizedSearch = search?.trim();
  const data = await runApi((client) =>
    client.notes.list({
      query: {
        search: normalizedSearch === "" ? undefined : normalizedSearch,
        limit,
      },
    }),
  );
  return [...data.notes];
};

export const createNote = async (content: string): Promise<string> => {
  const data = await runApi((client) => client.notes.create({ payload: { content } }));
  return data.id;
};

export const updateNote = async (id: string, content: string): Promise<void> => {
  await runApi((client) => client.notes.update({ params: { id }, payload: { content } }));
};

export const deleteNote = async (id: string): Promise<void> => {
  await runApi((client) => client.notes.remove({ params: { id } }));
};

export const buildNotesContext = (notes: Note[]): string => {
  if (notes.length === 0) return "";
  const lines = notes.map((note) => `- ${note.content}`).join("\n");
  return `The following notes are remembered from previous conversations:\n${lines}`;
};
