import { describe, expect, it } from "vitest";
import { healthFitWebContributions } from "../src/contributions.tsx";

describe("healthFitWebContributions", () => {
  it("registers the expected navigation entries", () => {
    const ids = (healthFitWebContributions.nav ?? []).map((entry) => entry.id);
    expect(ids).toEqual(["chat", "upload", "workouts", "summary", "notes", "memory", "settings"]);
  });

  it("registers a tool renderer for every healthfit visual tool", () => {
    const toolNames = (healthFitWebContributions.toolRenderers ?? []).map(
      (renderer) => renderer.toolName,
    );
    expect(toolNames).toEqual(["get_workout_history", "get_exercise_progress", "get_recovery"]);
  });

  it("gives every nav entry a stable href and icon", () => {
    for (const entry of healthFitWebContributions.nav ?? []) {
      expect(entry.href.startsWith("/")).toBe(true);
      expect(entry.icon).toBeDefined();
    }
  });
});
