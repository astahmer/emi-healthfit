import assert from "node:assert";
import { describe, it } from "node:test";
import { appendMemoryContext } from "../src/core/chat/memory-context.ts";

describe("memory context", () => {
  it("keeps the configured system prompt untouched without a summary", () => {
    assert.strictEqual(
      appendMemoryContext({ system: "Coach safely.", summary: undefined }),
      "Coach safely.",
    );
  });

  it("adds a compact memory summary with retrieval guidance", () => {
    const system = appendMemoryContext({
      system: "Coach safely.",
      summary: "- Prefers morning runs.",
    });

    assert.match(system ?? "", /Coach safely\./);
    assert.match(system ?? "", /search memories/i);
    assert.match(system ?? "", /Prefers morning runs/);
  });
});
