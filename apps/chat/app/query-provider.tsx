"use client";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { invalidateQueryResource, subscribeToQueryResourceChanges } from "./query-cache";

const QueryCacheInvalidator = () => {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      subscribeToQueryResourceChanges((resource) => {
        void invalidateQueryResource({ queryClient, resource });
      }),
    [queryClient],
  );

  return null;
};

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <QueryCacheInvalidator />
      {children}
    </QueryClientProvider>
  );
}
