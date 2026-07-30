import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeGeneratedStrings } from "../../src/chat/index.ts";

describe("@emi/core/chat", () => {
  it("normalizes JSON and list-shaped model output", () => {
    assert.deepEqual(normalizeGeneratedStrings('["First question", "Second question"]}'), [
      "First question",
      "Second question",
    ]);
    assert.deepEqual(normalizeGeneratedStrings("- First question\n- Second question"), [
      "First question",
      "Second question",
    ]);
  });
});
