import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolResultContent } from "./tool-result-content";

describe("ToolResultContent", () => {
  it("renders a safe empty state when workout history is missing", () => {
    render(
      <ToolResultContent
        toolName="render_component"
        result={{
          spec: {
            root: "root",
            elements: { root: { type: "WorkoutTable", props: {} } },
          },
        }}
      />,
    );

    expect(screen.getByText("No workouts found.")).toBeInTheDocument();
  });

  it("renders a compact empty state instead of an empty progress chart", () => {
    const view = render(
      <ToolResultContent
        toolName="get_exercise_progress"
        result={{
          exercise_title: "Bench Press",
          weeks: 8,
          workouts: [],
          personalRecord: { weight_kg: null, reps: null, volume_kg: null },
        }}
      />,
    );

    expect(screen.getByText("No workouts logged in this period.")).toBeInTheDocument();
    expect(view.container.querySelector(".recharts-responsive-container")).toBeNull();
  });

  it("renders a generative UI component for render_component tool results", () => {
    render(
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

  it("renders parsed string results as preformatted text", () => {
    render(<ToolResultContent toolName="get_summary" result='{"dailyActivity": 5}' />);

    expect(screen.getByText(/dailyActivity/)).toBeInTheDocument();
  });
});
