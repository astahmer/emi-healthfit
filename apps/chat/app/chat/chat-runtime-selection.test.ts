import { describe, expect, it } from "vitest";
import { canQueueFollowUp, runtimeSelectionMatches } from "./chat-runtime-selection";

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

  it("does not queue a new-chat submission into a stale stream", () => {
    expect(
      canQueueFollowUp({
        isStreaming: true,
        runtimeSessionId: "previous-chat",
        selectedSessionId: undefined,
        temporary: false,
      }),
    ).toBe(false);
  });

  it("queues a follow-up only for the selected streaming chat", () => {
    expect(
      canQueueFollowUp({
        isStreaming: true,
        runtimeSessionId: "selected-chat",
        selectedSessionId: "selected-chat",
        temporary: false,
      }),
    ).toBe(true);
  });
});
