import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoreWebProvider } from "@emi/core/web";
import { healthFitContributions } from "@/app/core-web-contributions";
import { ToolResultContent } from "./tool-result-content";

const renderToolResult = (element: React.ReactElement) =>
  render(<CoreWebProvider contributions={healthFitContributions}>{element}</CoreWebProvider>);

describe("ToolResultContent", () => {
  it("renders a safe empty state when workout history is missing", () => {
    renderToolResult(
      <ToolResultContent
        toolName="render_component"
        result={{
          spec: {
            root: "root",
            elements: { root: { type: "WorkoutTable", props: { workouts: [] } } },
          },
        }}
      />,
    );

    expect(screen.getByText("No workouts found.")).toBeInTheDocument();
  });

  it("renders a compact empty state instead of an empty progress chart", () => {
    const view = render(
      <CoreWebProvider contributions={healthFitContributions}>
        <ToolResultContent
          toolName="get_exercise_progress"
          result={{
            exercise_title: "Bench Press",
            weeks: 8,
            workouts: [],
            personalRecord: { weight_kg: null, reps: null, volume_kg: null },
          }}
        />
      </CoreWebProvider>,
    );

    expect(screen.getByText("No workouts logged in this period.")).toBeInTheDocument();
    expect(view.container.querySelector(".recharts-responsive-container")).toBeNull();
  });

  it("renders a generative UI component for render_component tool results", () => {
    renderToolResult(
      <div className="h-96 w-96">
        <ToolResultContent
          toolName="render_component"
          result={{
            spec: {
              root: "root",
              elements: {
                root: {
                  type: "MetricCard",
                  props: { label: "Bench PR", value: 100, unit: "kg", trend: "up" },
                },
              },
            },
          }}
        />
      </div>,
    );

    expect(screen.getByText("Bench PR")).toBeInTheDocument();
    expect(screen.getByText("100 kg")).toBeInTheDocument();
  });

  it("renders a persisted generative component tree", () => {
    renderToolResult(
      <div className="h-96 w-96">
        <ToolResultContent
          toolName="render_component"
          result={{
            spec: {
              root: "workouts",
              elements: {
                workouts: {
                  type: "WorkoutTable",
                  props: {
                    workouts: [
                      {
                        session_id: "workout-1",
                        title: "Full body",
                        start_time: "2026-07-28T10:00:00.000Z",
                        total_volume_kg: 2072,
                        exercise_count: 6,
                        set_count: 18,
                      },
                    ],
                  },
                  children: ["progress", "recovery", "metric", "sets"],
                },
                progress: {
                  type: "ExerciseProgress",
                  props: {
                    exercise_title: "Bench Press",
                    weeks: 8,
                    workouts: [
                      {
                        session_id: "workout-1",
                        title: "Full body",
                        start_time: "2026-07-28T10:00:00.000Z",
                        max_weight_kg: 100,
                        max_volume_kg: 1200,
                        total_volume_kg: 2072,
                        total_reps: 24,
                        sets: 3,
                      },
                    ],
                    personalRecord: { weight_kg: 100, reps: 5, volume_kg: 500 },
                  },
                },
                recovery: {
                  type: "RecoveryCard",
                  props: { label: "Ready", explanation: "Good recovery" },
                },
                metric: {
                  type: "MetricCard",
                  props: { value: 8742, unit: "steps/day", trend: "stable" },
                },
                sets: {
                  type: "SetList",
                  props: {
                    sets: [
                      {
                        id: "set-1",
                        exercise: "Bench Press",
                        weightKg: 100,
                        reps: 5,
                        rpe: 8,
                        setType: "normal",
                      },
                    ],
                  },
                },
              },
            },
          }}
        />
      </div>,
    );

    expect(screen.getByText("Full body")).toBeInTheDocument();
  });

  it("renders persisted component variants and normalizes legacy MetricCard props", () => {
    const view = renderToolResult(
      <div className="h-96 w-96">
        <ToolResultContent
          toolName="render_component"
          result={{
            spec: {
              root: "progress",
              elements: {
                progress: {
                  type: "ExerciseProgress",
                  props: {
                    exercise_title: "Bench Press",
                    weeks: 8,
                    workouts: [
                      {
                        session_id: "workout-1",
                        title: "Full body",
                        start_time: "2026-07-28T10:00:00.000Z",
                        max_weight_kg: 100,
                        max_volume_kg: 1200,
                        total_volume_kg: 2072,
                        total_reps: 24,
                        sets: 3,
                      },
                    ],
                    personalRecord: { weight_kg: 100, reps: 5, volume_kg: 500 },
                  },
                },
              },
            },
          }}
        />
        <ToolResultContent
          toolName="render_component"
          result={{
            spec: {
              root: "recovery",
              elements: {
                recovery: {
                  type: "RecoveryCard",
                  props: { label: "Ready", explanation: "Good recovery" },
                },
              },
            },
          }}
        />
        <ToolResultContent
          toolName="render_component"
          result={{
            spec: {
              root: "metric",
              elements: {
                metric: {
                  type: "MetricCard",
                  props: { value: 8742, unit: "steps/day", trend: "stable" },
                },
              },
            },
          }}
        />
        <ToolResultContent
          toolName="render_component"
          result={{
            spec: {
              root: "sets",
              elements: {
                sets: {
                  type: "SetList",
                  props: {
                    sets: [
                      {
                        id: "set-1",
                        exercise: "Deadlift",
                        weightKg: 100,
                        reps: 5,
                        rpe: 8,
                        setType: "normal",
                      },
                    ],
                  },
                },
              },
            },
          }}
        />
      </div>,
    );

    expect(screen.getByText("Bench Press")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Metric")).toBeInTheDocument();
    expect(screen.getByText("flat")).toBeInTheDocument();
    expect(screen.getByText("Deadlift")).toBeInTheDocument();
    expect(view.container.querySelector(".recharts-responsive-container")).not.toBeNull();
  });

  it("renders parsed string results as preformatted text", () => {
    renderToolResult(<ToolResultContent toolName="get_summary" result='{"dailyActivity": 5}' />);

    expect(screen.getByText(/dailyActivity/)).toBeInTheDocument();
  });
});
