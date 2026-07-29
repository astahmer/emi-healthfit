import { describe, expect, it } from "vitest";
import {
  HevyNotConnectedError,
  HevySyncBusyError,
  isExpectedHevyFreshFailure,
} from "../src/integrations/hevy/hevy-sync.ts";

describe("isExpectedHevyFreshFailure", () => {
  it("treats not-connected and busy as expected", () => {
    expect(
      isExpectedHevyFreshFailure(new HevyNotConnectedError({ message: "not connected" })),
    ).toBe(true);
    expect(isExpectedHevyFreshFailure(new HevySyncBusyError({ message: "busy" }))).toBe(true);
  });

  it("treats unexpected errors as not expected", () => {
    expect(isExpectedHevyFreshFailure(new Error("boom"))).toBe(false);
    expect(isExpectedHevyFreshFailure("string")).toBe(false);
    expect(isExpectedHevyFreshFailure(null)).toBe(false);
  });
});
