import assert from "node:assert";
import { describe, it } from "node:test";
import { tools } from "../src/healthfit/tools/api.ts";

describe("conversation thread tools", () => {
  it("does not expose unscoped SQL", () => {
    assert.ok(!tools.some((tool) => tool.name === "query_database"));
  });
  it("exposes the explicit thread tool surface", () => {
    const names = new Set(tools.map((tool) => tool.name));
    assert.deepStrictEqual(
      [
        "get_threads",
        "read_thread",
        "read_message",
        "create_thread",
        "summarize_thread",
        "summarize_to_message",
      ].filter((name) => !names.has(name)),
      [],
    );
  });

  it("exposes provider-compatible object schemas for every tool", () => {
    for (const tool of tools) {
      assert.strictEqual(tool.parameters.type, "object", tool.name);
      assert.ok(!("anyOf" in tool.parameters), tool.name);
    }
  });
});
