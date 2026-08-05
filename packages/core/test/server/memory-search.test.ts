import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreMemorySearch, tokenize } from "../../src/server/memory-search.ts";

describe("memory search scoring", () => {
  it("tokenizes lowercase alphanumeric runs and drops single characters", () => {
    assert.deepEqual(tokenize("Préfère le café à 7h!"), ["préfère", "le", "café", "7h"]);
    assert.deepEqual(tokenize("  "), []);
  });

  it("ranks exact word matches above prefix and substring matches", () => {
    const exact = scoreMemorySearch({ query: "runs", content: "Prefers morning runs" });
    const prefix = scoreMemorySearch({ query: "run", content: "Prefers morning runs" });
    const substring = scoreMemorySearch({ query: "unning", content: "Prefers morning running" });
    assert.ok(exact > prefix);
    assert.ok(prefix > substring);
    assert.ok(substring > 0);
  });

  it("prefers matches covering every query token", () => {
    const both = scoreMemorySearch({
      query: "wednesday rest",
      content: "Prefers Wednesday rest days",
    });
    const one = scoreMemorySearch({
      query: "wednesday rest",
      content: "Prefers Wednesday training",
    });
    assert.ok(both > one);
  });

  it("awards a phrase bonus when tokens appear in order", () => {
    const inOrder = scoreMemorySearch({
      query: "rest days",
      content: "Prefers Wednesday rest days",
    });
    const reversed = scoreMemorySearch({ query: "rest days", content: "Days rest after training" });
    assert.ok(inOrder > reversed);
  });

  it("returns zero when nothing matches or the query is empty", () => {
    assert.equal(scoreMemorySearch({ query: "snowboarding", content: "Prefers morning runs" }), 0);
    assert.equal(scoreMemorySearch({ query: "  ", content: "Prefers morning runs" }), 0);
  });
});
