import { describe, expect, it } from "vitest";
import { HealthFitApi } from "../src/contract/index.ts";

describe("@emi/flavor-healthfit/contract", () => {
  it("composes the generic core API with HealthFit product groups", () => {
    expect(Object.keys(HealthFitApi.groups).toSorted()).toEqual([
      "analytics",
      "conversations",
      "data",
      "discord",
      "hevy",
      "memories",
      "memoryExtraction",
      "messages",
      "notes",
      "privacy",
      "suggestions",
      "threads",
      "workouts",
    ]);
  });

  it("loads through the public contract subpath", async () => {
    const contract = await import("@emi/flavor-healthfit/contract");
    expect(contract.HealthFitApi).toBe(HealthFitApi);
  });
});
