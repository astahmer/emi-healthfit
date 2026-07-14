"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchNotes, type Note } from "./notes";

interface NotesContextValue {
  notes: Note[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const NotesContext = createContext<NotesContextValue | null>(null);

export const NotesProvider = ({ children }: { children: ReactNode }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchNotes(undefined, 100)
      .then(setNotes)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(
    () => ({ notes, loading, error, reload: load }),
    [notes, loading, error, load],
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
};

export const useNotes = (): NotesContextValue => {
  const context = useContext(NotesContext);
  if (context === null) {
    throw new Error("useNotes must be used within a NotesProvider");
  }
  return context;
};
