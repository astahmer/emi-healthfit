"use client";

import { isNonEmptySpec } from "@json-render/core";
import { defineRegistry, JSONUIProvider, Renderer } from "@json-render/react";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { catalog } from "./catalog.ts";
import {
  ExerciseProgressView,
  GoalProgressCard,
  NextWorkoutCard,
  RecoveryCard,
  RecoveryTimelineView,
  SleepTrendView,
  TrainingLoadView,
  WorkoutStreakCard,
  WorkoutHistoryTable,
} from "../../components/tool-renderers.tsx";

const { registry } = defineRegistry(catalog, {
  actions: {},
  components: {
    WorkoutTable: ({ props }) => <WorkoutHistoryTable items={props.workouts} />,
    ExerciseProgress: ({ props }) => <ExerciseProgressView data={props} />,
    RecoveryCard: ({ props }) => <RecoveryCard data={props} />,
    SleepTrend: ({ props }) => <SleepTrendView data={props} />,
    WorkoutStreak: ({ props }) => <WorkoutStreakCard data={props} />,
    TrainingLoad: ({ props }) => <TrainingLoadView data={props} />,
    RecoveryTimeline: ({ props }) => <RecoveryTimelineView data={props} />,
    GoalProgress: ({ props }) => <GoalProgressCard data={props} />,
    NextWorkout: ({ props }) => <NextWorkoutCard data={props} />,
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
        {props.sets.map((set) => (
          <div key={set.id} className="rounded-md border p-2 text-sm">
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

const RawElement = Schema.Struct({
  type: Schema.String,
  props: Schema.Unknown,
  children: Schema.optional(Schema.Array(Schema.String)),
  visible: Schema.optional(Schema.Unknown),
});

const RawSpec = Schema.Struct({
  root: Schema.String,
  elements: Schema.Record(Schema.String, RawElement),
});

const decodeRawSpec = Schema.decodeUnknownOption(RawSpec);

const normalizeSpec = (raw: unknown) => {
  const decoded = decodeRawSpec(raw);
  if (Option.isNone(decoded)) return null;

  const validation = catalog.validate({
    ...decoded.value,
    elements: Object.fromEntries(
      Object.entries(decoded.value.elements).map(([key, element]) => [
        key,
        {
          ...element,
          props: element.props,
          children: element.children ?? [],
          visible: element.visible,
        },
      ]),
    ),
  });
  if (!validation.success || !isNonEmptySpec(validation.data)) return null;
  return validation.data;
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
