"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { runApi } from "./api-client";

const compactDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const formatChartLabel = (value: ReactNode) =>
  typeof value === "string" ? compactDate(value) : value;

const fetchOverview = (days: number) =>
  runApi((client) => client.analytics.overview({ query: { days } }));

const ChartCard = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) => (
  <section className="rounded-xl border bg-card p-4">
    <h3 className="font-medium">{title}</h3>
    <p className="mb-4 text-xs text-muted-foreground">{subtitle}</p>
    <div className="h-64">{children}</div>
  </section>
);

const EmptyChart = () => (
  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
    No data in this period.
  </div>
);

const trainingBarRadius: [number, number, number, number] = [4, 4, 0, 0];
const bodyWeightDomain = ["dataMin - 2", "dataMax + 2"];

export const SummaryPanel = () => {
  const [days, setDays] = useState(90);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics-overview", days],
    queryFn: () => fetchOverview(days),
  });
  const sleep =
    data?.sleep.map((row) => ({ ...row, hours: (row.asleep_min ?? row.in_bed_min ?? 0) / 60 })) ??
    [];
  const highlights = data?.highlights;
  const metrics = [
    {
      label: "Average steps",
      value:
        highlights?.averageSteps == null
          ? "—"
          : Math.round(highlights.averageSteps).toLocaleString(),
    },
    {
      label: "Average sleep",
      value:
        highlights?.averageSleepMinutes == null
          ? "—"
          : `${(highlights.averageSleepMinutes / 60).toFixed(1)} h`,
    },
    { label: "Workouts", value: highlights?.workouts.toLocaleString() ?? "—" },
    {
      label: "Training volume",
      value:
        highlights === undefined
          ? "—"
          : `${Math.round(highlights.trainingVolumeKg).toLocaleString()} kg`,
    },
    {
      label: "Weight change",
      value:
        highlights?.weightChangeKg == null
          ? "—"
          : `${highlights.weightChangeKg > 0 ? "+" : ""}${highlights.weightChangeKg.toFixed(1)} kg`,
    },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-xl font-semibold">Health overview</h2>
            <p className="text-sm text-muted-foreground">
              Activity, recovery, body, and training trends together.
            </p>
          </div>
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="ms-auto rounded-md border bg-background px-3 py-2 text-sm"
            aria-label="Analytics period"
          >
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={180}>6 months</option>
            <option value={365}>1 year</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isLoading}>
            {isLoading ? "Loading…" : "Refresh"}
          </Button>
        </div>

        {error !== null && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error.message}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl border bg-card p-4">
              <div className="text-2xl font-semibold">{metric.value}</div>
              <div className="text-xs text-muted-foreground">{metric.label}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Daily activity" subtitle="Steps and active calories">
            {data === undefined || data.activity.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.activity}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tickFormatter={compactDate} minTickGap={32} />
                  <YAxis yAxisId="steps" width={45} />
                  <YAxis yAxisId="kcal" orientation="right" width={38} />
                  <Tooltip labelFormatter={formatChartLabel} />
                  <Bar
                    yAxisId="kcal"
                    dataKey="active_kcal"
                    fill="var(--color-chart-2)"
                    opacity={0.45}
                    name="Active kcal"
                  />
                  <Line
                    yAxisId="steps"
                    dataKey="steps"
                    stroke="var(--color-chart-1)"
                    dot={false}
                    strokeWidth={2}
                    name="Steps"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Sleep" subtitle="Nightly asleep time">
            {sleep.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sleep}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tickFormatter={compactDate} minTickGap={32} />
                  <YAxis unit="h" width={35} />
                  <Tooltip labelFormatter={formatChartLabel} />
                  <Area
                    dataKey="hours"
                    stroke="var(--color-chart-3)"
                    fill="var(--color-chart-3)"
                    fillOpacity={0.25}
                    name="Sleep hours"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Training volume" subtitle="Daily Hevy volume">
            {data === undefined || data.training.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.training}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tickFormatter={compactDate} minTickGap={32} />
                  <YAxis width={55} />
                  <Tooltip labelFormatter={formatChartLabel} />
                  <Bar
                    dataKey="volume_kg"
                    fill="var(--color-chart-4)"
                    radius={trainingBarRadius}
                    name="Volume (kg)"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Body weight" subtitle="Imported body metric measurements">
            {data === undefined || data.body.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.body}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tickFormatter={compactDate} minTickGap={32} />
                  <YAxis domain={bodyWeightDomain} unit="kg" width={50} />
                  <Tooltip labelFormatter={formatChartLabel} />
                  <Area
                    dataKey="weight_kg"
                    stroke="var(--color-chart-5)"
                    fill="var(--color-chart-5)"
                    fillOpacity={0.2}
                    name="Weight"
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        <section className="rounded-xl border bg-card p-4">
          <h3 className="font-medium">Most trained exercises</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Ranked by logged sets in this period.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {data?.exercises.map((exercise) => (
              <div key={exercise.exercise_title} className="rounded-md bg-muted/40 p-3">
                <p className="truncate text-sm font-medium">{exercise.exercise_title}</p>
                <p className="text-xs text-muted-foreground">
                  {exercise.sets} sets · {Math.round(exercise.volume_kg).toLocaleString()} kg
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
