import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  invalidateQueryResource,
  notifyHevyWorkoutDataChanged,
  queryKeys,
  subscribeToQueryResourceChanges,
} from "./query-cache";

describe("query cache", () => {
  it("keeps memory views distinct and invalidates them as one resource", async () => {
    const queryClient = new QueryClient();
    const listKey = queryKeys.memories.list({ search: "message-sources" });
    const messageSourcesKey = queryKeys.memories.messageSources;
    queryClient.setQueryData(listKey, []);
    queryClient.setQueryData(messageSourcesKey, []);

    await invalidateQueryResource({ queryClient, resource: "memories" });

    expect(listKey).not.toEqual(messageSourcesKey);
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(messageSourcesKey)?.isInvalidated).toBe(true);
  });

  it("notifies workouts and analytics after Hevy data changes", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeToQueryResourceChanges((resource) => {
      seen.push(resource);
    });
    notifyHevyWorkoutDataChanged();
    unsubscribe();
    expect(seen).toEqual(["workouts", "analytics"]);
  });
});
