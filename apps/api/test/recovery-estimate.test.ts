import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HealthFit } from "@emi/flavor-healthfit";

const { estimateRecovery } = HealthFit.chat;

describe("recovery estimate", () => {
  it("does not diagnose poor recovery when sleep data is missing", () => {
    const estimate = estimateRecovery({ sleepAverageMinutes: null, strain48Hours: 3_651 });

    assert.strictEqual(estimate.label, "Insufficient data");
    assert.match(estimate.explanation, /readiness cannot be estimated reliably/);
  });

  it("combines known sleep and strain without claiming certainty", () => {
    const estimate = estimateRecovery({ sleepAverageMinutes: 450, strain48Hours: 8_000 });

    assert.strictEqual(estimate.label, "Mixed signals");
    assert.match(estimate.explanation, /current symptoms and perceived exertion/);
  });
});
