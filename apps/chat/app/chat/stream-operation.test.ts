import { describe, expect, it } from "vitest";
import { shouldAcceptStreamUpdate, shouldApplyHistoryWhileStreaming } from "./stream-operation";

describe("shouldAcceptStreamUpdate", () => {
  it("accepts updates for the active operation only", () => {
    expect(shouldAcceptStreamUpdate({ activeOperation: 3, eventOperation: 3 })).toBe(true);
    expect(shouldAcceptStreamUpdate({ activeOperation: 4, eventOperation: 3 })).toBe(false);
    expect(shouldAcceptStreamUpdate({ activeOperation: 3, eventOperation: 4 })).toBe(false);
  });
});

describe("shouldApplyHistoryWhileStreaming", () => {
  it("ignores same-session history while a generation is live", () => {
    expect(
      shouldApplyHistoryWhileStreaming({
        contextSessionId: "one",
        eventSessionId: "one",
      }),
    ).toBe(false);
  });

  it("allows history when the selected session changes", () => {
    expect(
      shouldApplyHistoryWhileStreaming({
        contextSessionId: "one",
        eventSessionId: "two",
      }),
    ).toBe(true);
  });
});
