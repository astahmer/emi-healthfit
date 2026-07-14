"use client";

import { type Spec, defineRegistry, JSONUIProvider, Renderer } from "@json-render/react";
import { catalog } from "@/app/gen-ui/catalog";
import {
  ExerciseProgressView,
  RecoveryCard,
  WorkoutHistoryTable,
} from "@/components/assistant-ui/tool-result-content";

const { registry } = defineRegistry(catalog, {
  actions: {},
  components: {
    WorkoutTable: ({ props }) => <WorkoutHistoryTable items={props.workouts} />,
    ExerciseProgress: ({ props }) => <ExerciseProgressView data={props} />,
    RecoveryCard: ({ props }) => <RecoveryCard data={props} />,
    MetricCard: ({ props }) => (
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">{props.label}</p>
        <p className="text-lg font-semibold">
          {props.value} {props.unit ?? ""}
        </p>
        {props.trend !== undefined && (
          <span
            className={`text-xs ${
              props.trend === "up"
                ? "text-green-600"
                : props.trend === "down"
                  ? "text-red-600"
                  : "text-muted-foreground"
            }`}
          >
            {props.trend}
          </span>
        )}
      </div>
    ),
    SetList: ({ props }) => (
      <div className="flex flex-col gap-2">
        {props.sets.map((set, index) => (
          <div
            key={`set-${index}-${set.exercise}-${set.weightKg ?? ""}`}
            className="rounded-md border p-2 text-sm"
          >
            <p className="font-medium">{set.exercise}</p>
            <p className="text-muted-foreground">
              {set.weightKg !== null ? `${set.weightKg} kg` : "—"} ·{" "}
              {set.reps !== null ? `${set.reps} reps` : "—"}
              {set.rpe !== null ? ` · RPE ${set.rpe}` : ""}
              {set.setType !== null ? ` · ${set.setType}` : ""}
            </p>
          </div>
        ))}
      </div>
    ),
  },
});

const normalizeSpec = (raw: unknown): Spec | null => {
  if (raw === null || typeof raw !== "object") return null;
  const spec = raw as Record<string, unknown>;

  if ("elements" in spec && typeof spec.elements === "object" && spec.elements !== null) {
    return spec as unknown as Spec;
  }

  if ("root" in spec && typeof spec.root === "object" && spec.root !== null) {
    const rootElement = spec.root as Record<string, unknown>;
    return {
      root: "root",
      elements: { root: rootElement },
    } as unknown as Spec;
  }

  if ("root" in spec && typeof spec.root === "string") {
    return spec as unknown as Spec;
  }

  return null;
};

export const GenUIRenderer = ({ spec }: { spec: unknown }) => {
  const normalized = normalizeSpec(spec);
  if (normalized === null) return null;

  return (
    <JSONUIProvider registry={registry}>
      <Renderer spec={normalized} registry={registry} />
    </JSONUIProvider>
  );
};
