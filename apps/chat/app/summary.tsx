"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { z } from "zod";

interface DataSummary {
  dailyActivity: number;
  healthWorkouts: number;
  hevySessions: number;
  hevySets: number;
  sleepSessions: number;
  bodyMetrics: number;
  lastHealthSync: string | null;
  lastHevySync: string | null;
}

const dataSummarySchema: z.ZodType<DataSummary & { error?: string }> = z.object({
  dailyActivity: z.number(),
  healthWorkouts: z.number(),
  hevySessions: z.number(),
  hevySets: z.number(),
  sleepSessions: z.number(),
  bodyMetrics: z.number(),
  lastHealthSync: z.string().nullable(),
  lastHevySync: z.string().nullable(),
  error: z.string().optional(),
});

const fetchSummary = async (): Promise<DataSummary> => {
  const res = await fetch(`${window.location.origin}/api/summary`);
  const data = dataSummarySchema.parse(await res.json());
  if (!res.ok) throw new Error(data.error || "Failed to load summary.");
  return data;
};

export function SummaryPanel() {
  const {
    data: summary,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["summary"],
    queryFn: fetchSummary,
  });

  const items = summary
    ? [
        { number: summary.dailyActivity, label: "Daily activity" },
        { number: summary.healthWorkouts, label: "Health workouts" },
        { number: summary.sleepSessions, label: "Sleep sessions" },
        { number: summary.bodyMetrics, label: "Body metrics" },
        { number: summary.hevySessions, label: "Hevy sessions" },
        { number: summary.hevySets, label: "Hevy sets" },
      ]
    : [];

  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Summary</h2>
        <Button onClick={() => void refetch()} disabled={isLoading} size="sm">
          {isLoading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {error !== null && (
        <div className="bg-muted mb-4 rounded-md p-3 text-sm text-red-500">{error.message}</div>
      )}

      {summary !== undefined && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((item) => (
              <div key={item.label} className="bg-muted rounded-md p-4 text-center">
                <div className="text-2xl font-bold">{item.number}</div>
                <div className="text-muted-foreground text-xs">{item.label}</div>
              </div>
            ))}
          </div>
          <div className="text-muted-foreground mt-4 text-sm">
            <p>
              Last health sync:{" "}
              {summary.lastHealthSync ? new Date(summary.lastHealthSync).toLocaleString() : "never"}
            </p>
            <p>
              Last Hevy sync:{" "}
              {summary.lastHevySync ? new Date(summary.lastHevySync).toLocaleString() : "never"}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
