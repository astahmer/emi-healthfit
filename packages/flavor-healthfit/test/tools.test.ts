import { describe, expect, it } from "vitest";
import { tools } from "../src/tools/api.ts";

describe("HealthFit tools", () => {
  it("does not expose unscoped SQL", () => {
    expect(tools.some((tool) => tool.name === "query_database")).toBe(false);
  });

  it("exposes the fitness tool surface", () => {
    const names = new Set(tools.map((tool) => tool.name));
    expect(
      [
        "get_summary",
        "get_recovery",
        "get_workout_history",
        "get_workout_details",
        "get_exercise_progress",
        "get_sleep_trend",
        "get_workout_streak",
        "search_memory_summary",
        "search_memories",
        "search_conversations",
        "render_component",
      ].filter((name) => !names.has(name)),
    ).toEqual([]);
  });

  it("exposes the shared thread tool surface", () => {
    const names = new Set(tools.map((tool) => tool.name));
    expect(
      [
        "get_threads",
        "read_thread",
        "read_message",
        "create_thread",
        "summarize_thread",
        "summarize_to_message",
      ].filter((name) => !names.has(name)),
    ).toEqual([]);
  });

  it("exposes provider-compatible object schemas for every tool", () => {
    for (const tool of tools) {
      expect(tool.parameters.type, tool.name).toBe("object");
      expect(tool.parameters).not.toHaveProperty("anyOf");
    }
  });
});
