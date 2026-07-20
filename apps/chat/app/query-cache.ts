import type { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  analytics: {
    overview: ({ days }: { days: number }) => ["analytics-overview", days] as const,
  },
  conversations: {
    all: ["threads"] as const,
    detail: ({ id }: { id: string }) => ["conversation", id] as const,
    list: ({ search }: { search: string }) => ["threads", "list", search] as const,
  },
  memories: {
    all: ["memories"] as const,
    list: ({ search }: { search: string }) => ["memories", "list", search] as const,
    messageSources: ["memories", "message-sources"] as const,
  },
  notes: {
    all: ["notes"] as const,
    list: ({ search }: { search: string }) => ["notes", "list", search] as const,
  },
  suggestions: {
    message: ({
      assistantId,
      assistantText,
      userText,
    }: {
      assistantId: string | undefined;
      assistantText: string;
      userText: string;
    }) => ["suggestions", assistantId, assistantText, userText] as const,
  },
  workouts: {
    all: ["workouts"] as const,
  },
};

type QueryResource = "analytics" | "memories" | "notes" | "workouts";

const resourceQueryKeys = {
  analytics: ["analytics-overview"] as const,
  memories: queryKeys.memories.all,
  notes: queryKeys.notes.all,
  workouts: queryKeys.workouts.all,
} satisfies Record<QueryResource, readonly unknown[]>;

const listeners = new Set<(resource: QueryResource) => void>();

export const invalidateQueryResource = ({
  queryClient,
  resource,
}: {
  queryClient: QueryClient;
  resource: QueryResource;
}) => queryClient.invalidateQueries({ queryKey: resourceQueryKeys[resource] });

export const notifyQueryResourceChanged = (resource: QueryResource) => {
  for (const listener of listeners) listener(resource);
};

export const notifyHevyWorkoutDataChanged = () => {
  notifyQueryResourceChanged("workouts");
  notifyQueryResourceChanged("analytics");
};

export const subscribeToQueryResourceChanges = (listener: (resource: QueryResource) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
