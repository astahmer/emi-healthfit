import { render, screen, waitFor } from "@testing-library/react";
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
                  props: { label: "Steps", value: 8742, unit: "steps/day", trend: "flat" },
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

  it("renders persisted component variants with the current MetricCard contract", async () => {
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
                  props: { label: "Steps", value: 8742, unit: "steps/day", trend: "flat" },
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
    expect(screen.getByText("Steps")).toBeInTheDocument();
    expect(screen.getByText("flat")).toBeInTheDocument();
    expect(screen.getByText("Deadlift")).toBeInTheDocument();
    await waitFor(() => {
      expect(view.container.querySelector(".recharts-responsive-container")).not.toBeNull();
    });
  });

  it("renders sleep trends and workout streaks from tool results", async () => {
    const view = renderToolResult(
      <div className="h-96 w-96">
        <ToolResultContent
          toolName="get_sleep_trend"
          result={{
            days: 2,
            avg_in_bed_min: 495,
            avg_asleep_min: 450,
            avg_awake_min: 45,
            avg_sleep_hours: 7.5,
            nights: [
              {
                date: "2026-07-18",
                in_bed_min: 480,
                asleep_min: 420,
                awake_min: 60,
              },
              {
                date: "2026-07-19",
                in_bed_min: 510,
                asleep_min: 480,
                awake_min: 30,
              },
            ],
          }}
        />
        <ToolResultContent
          toolName="get_workout_streak"
          result={{
            current_streak: 3,
            longest_streak: 7,
            last_workout_date: "2026-07-19",
          }}
        />
        <ToolResultContent
          toolName="get_training_load"
          result={{
            weeks: [
              {
                week_start: "2026-07-13",
                workouts: 3,
                sets: 18,
                volume_kg: 6_500,
                duration_sec: 10_800,
              },
            ],
            total_volume_kg: 6_500,
            current_week_volume_kg: 6_500,
            previous_week_volume_kg: 5_000,
            volume_change_pct: 30,
          }}
        />
        <ToolResultContent
          toolName="get_recovery_timeline"
          result={{
            days: [
              { date: "2026-07-18", asleep_min: 420, workouts: 1, volume_kg: 2_000 },
              { date: "2026-07-19", asleep_min: 480, workouts: 0, volume_kg: 0 },
            ],
            average_sleep_hours: 7.5,
          }}
        />
        <ToolResultContent
          toolName="get_goal_progress"
          result={{
            period_days: 7,
            average_steps: 8_500,
            step_goal: 10_000,
            workouts: 3,
            workouts_goal: 3,
            latest_weight_kg: 78.5,
            latest_weight_date: null,
            target_weight_kg: 75,
            weight_remaining_kg: -3.5,
          }}
        />
        <ToolResultContent
          toolName="get_next_workout"
          result={{
            suggested_title: "Upper body",
            readiness: "ready",
            reason: "Your last logged session was Lower body; this rotates the next focus.",
            last_workout_date: "2026-07-19",
            last_workout_title: "Lower body",
            days_since_last_workout: 1,
            recent_workout_count: 3,
            sleep_average_hours: 7.5,
          }}
        />
      </div>,
    );

    expect(screen.getByText("Sleep trend")).toBeInTheDocument();
    expect(screen.getByText("7h 00m")).toBeInTheDocument();
    expect(screen.getByText("Current streak")).toBeInTheDocument();
    expect(screen.getByText("3 days")).toBeInTheDocument();
    expect(screen.getByText("Training load")).toBeInTheDocument();
    expect(screen.getByText("Recovery timeline")).toBeInTheDocument();
    expect(screen.getByText("Strength workouts")).toBeInTheDocument();
    expect(screen.getByText("Suggested next workout")).toBeInTheDocument();
    await waitFor(() => {
      expect(view.container.querySelector("[data-testid='sleep-trend-chart']")).not.toBeNull();
      expect(view.container.querySelector("[data-testid='training-load-chart']")).not.toBeNull();
      expect(
        view.container.querySelector("[data-testid='recovery-timeline-chart']"),
      ).not.toBeNull();
    });
  });

  it("renders parsed string results as preformatted text", () => {
    renderToolResult(<ToolResultContent toolName="get_summary" result='{"dailyActivity": 5}' />);

    expect(screen.getByText(/dailyActivity/)).toBeInTheDocument();
  });
});
