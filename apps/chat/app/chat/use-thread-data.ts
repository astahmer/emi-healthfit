"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchThreadMessages, type MessageWithUsage, type Thread } from "../sessions";

export interface ThreadData {
  thread: Thread | null;
  messages: MessageWithUsage[];
}

const emptyThreadData: ThreadData = { thread: null, messages: [] };

export const useThreadData = (
  sessionId: string | undefined,
): {
  data: ThreadData;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} => {
  const query = useQuery<ThreadData, Error>({
    queryKey: ["thread", sessionId],
    queryFn: async () => fetchThreadMessages(sessionId as string),
    enabled: sessionId !== undefined,
  });

  if (sessionId === undefined) {
    return { data: emptyThreadData, isLoading: false, error: null, refetch: () => {} };
  }

  return {
    data: query.data ?? emptyThreadData,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};
