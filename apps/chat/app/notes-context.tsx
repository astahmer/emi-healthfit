"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchNotes, type Note } from "./notes";
import { queryKeys } from "./query-cache";

interface NotesContextValue {
  notes: Note[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const NotesContext = createContext<NotesContextValue | null>(null);

export const NotesProvider = ({ children }: { children: ReactNode }) => {
  const {
    data: notes = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.notes.list({ search: "" }),
    queryFn: () => fetchNotes(undefined, 100),
  });

  const value = useMemo<NotesContextValue>(
    () => ({
      notes,
      loading: isLoading,
      error: error?.message ?? null,
      reload: refetch,
    }),
    [notes, isLoading, error, refetch],
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
