import { describe, expect, it } from "vitest";
import { shouldApplyHistoryChange } from "./use-chat-history-sync";

describe("shouldApplyHistoryChange", () => {
  it("skips prop-driven history while the conversation is still loading", () => {
    expect(shouldApplyHistoryChange({ historyReady: false, isStreamingSameSession: false })).toBe(
      false,
    );
  });

  it("skips prop-driven history while streaming the same session", () => {
    expect(shouldApplyHistoryChange({ historyReady: true, isStreamingSameSession: true })).toBe(
      false,
    );
  });

  it("applies ready history when idle", () => {
    expect(shouldApplyHistoryChange({ historyReady: true, isStreamingSameSession: false })).toBe(
      true,
    );
  });
});
