import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveGenerationTerminalState } from "../src/core/chat/generation-terminal-state.ts";

describe("generation terminal state", () => {
  it("fails a stream that closes mid-message without a terminal chunk", () => {
    assert.deepStrictEqual(
      resolveGenerationTerminalState({ streamError: undefined, sawFinish: false }),
      {
        status: "failed",
        error: "Generation stream ended before a terminal chunk was received.",
      },
    );
  });

  it("preserves provider errors and accepts a finish chunk", () => {
    assert.deepStrictEqual(
      resolveGenerationTerminalState({ streamError: "provider unavailable", sawFinish: false }),
      { status: "failed", error: "provider unavailable" },
    );
    assert.deepStrictEqual(
      resolveGenerationTerminalState({ streamError: undefined, sawFinish: true }),
      { status: "completed", error: undefined },
    );
  });
});
