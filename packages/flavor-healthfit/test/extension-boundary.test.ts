import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { healthFitExtension } from "../src/core-extension.ts";

describe("HealthFit extension boundary", () => {
  it("keeps product namespace and composition outside generic core", async () => {
    const extension = await Effect.runPromise(healthFitExtension);
    expect(extension.id).toBe("healthfit");
    expect(extension.namespace).toBe("healthfit.chat");
    expect(Object.keys(extension.tools)).toContain("get_workout_history");
    expect(Object.keys(extension.tools)).not.toContain("get_recovery");
    expect(Object.keys(extension.tools)).not.toContain("get_recovery_timeline");
    expect(Object.keys(extension.tools)).not.toContain("get_sleep_trend");
    expect(Object.keys(extension.tools)).not.toContain("get_next_workout");
  });
});
