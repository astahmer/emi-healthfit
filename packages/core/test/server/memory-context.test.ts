import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ServerDatabase } from "../../src/server-database.export.ts";

describe("ServerDatabase.memoryContext", () => {
  it("keeps the configured system prompt untouched without a summary", () => {
    assert.equal(
      ServerDatabase.memoryContext.append({ system: "Coach safely.", summary: undefined }),
      "Coach safely.",
    );
  });

  it("adds a compact memory summary with retrieval guidance", () => {
    const system = ServerDatabase.memoryContext.append({
      system: "Coach safely.",
      summary: "- Prefers morning runs.",
    });

    assert.match(system ?? "", /Coach safely\./);
    assert.match(system ?? "", /search memories/i);
    assert.match(system ?? "", /Prefers morning runs/);
  });
});
