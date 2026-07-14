import { describe, expect, it, vi } from "vitest";
import { buildTools } from "./tools";

const definition = {
  name: "get_workout_history",
  description: "List recent workouts.",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "integer" },
    },
  },
} as const;

describe("buildTools", () => {
  it("builds backend tools without a client-side execute", () => {
    const tools = buildTools([definition], "backend");
    const tool = tools.get_workout_history;

    expect(tool.type).toBe("backend");
    expect(tool.description).toBe(definition.description);
    expect(tool.parameters).toBe(definition.parameters);
    expect("execute" in tool).toBe(false);
  });

  it("builds frontend tools with a client-side execute that posts to /api/tools/:name", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ workouts: [] }),
    });

    const tools = buildTools([definition], "frontend");
    const tool = tools.get_workout_history;

    expect(tool.type).toBe("frontend");
    expect("execute" in tool).toBe(true);

    const result = await (
      tool as unknown as { execute: (args: Record<string, unknown>) => Promise<string> }
    ).execute({ limit: 5 });

    expect(global.fetch).toHaveBeenCalledWith(
      `${window.location.origin}/api/tools/get_workout_history`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 5 }),
      },
    );
    expect(result).toBe(JSON.stringify({ workouts: [] }));
  });
});
