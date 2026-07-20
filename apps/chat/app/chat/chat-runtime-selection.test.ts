import { describe, expect, it } from "vitest";
import { runtimeSelectionMatches } from "./chat-runtime-selection";

describe("runtimeSelectionMatches", () => {
  it("matches identical selected and runtime session ids", () => {
    expect(
      runtimeSelectionMatches({
        runtimeSessionId: "abc",
        selectedSessionId: "abc",
        temporary: false,
      }),
    ).toBe(true);
  });

  it("rejects a stale runtime session when selection moved", () => {
    expect(
      runtimeSelectionMatches({
        runtimeSessionId: "old",
        selectedSessionId: "new",
        temporary: false,
      }),
    ).toBe(false);
  });

  it("keeps an in-memory temporary session on the new-chat route", () => {
    expect(
      runtimeSelectionMatches({
        runtimeSessionId: "temp_123",
        selectedSessionId: undefined,
        temporary: true,
      }),
    ).toBe(true);
  });

  it("does not treat a temp runtime id as selected outside temporary mode", () => {
    expect(
      runtimeSelectionMatches({
        runtimeSessionId: "temp_123",
        selectedSessionId: undefined,
        temporary: false,
      }),
    ).toBe(false);
  });
});
