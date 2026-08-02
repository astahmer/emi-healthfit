import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { healthFitExtension } from "../src/core-extension.ts";

describe("HealthFit extension boundary", () => {
  it("keeps product namespace and composition outside generic core", async () => {
    const extension = await Effect.runPromise(healthFitExtension);
    expect(extension.id).toBe("healthfit");
    expect(extension.namespace).toBe("healthfit.chat");
    expect(Object.keys(extension.tools)).toContain("get_recovery");
  });
});
