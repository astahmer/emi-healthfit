import assert from "node:assert";
import { describe, it } from "node:test";
import { executeTool, tools } from "../src/tools/api.ts";
import * as Effect from "effect/Effect";

const fakeDb = {} as never;

const run = <A>(effect: Effect.Effect<A>) => Effect.runPromise(effect);

describe("query_database tool", () => {
  it("rejects write commands", async () => {
    await assert.rejects(
      run(
        executeTool({
          db: fakeDb,
          name: "query_database",
          args: { query: "DELETE FROM users" },
        }),
      ),
      /Only one SELECT query/,
    );

    await assert.rejects(
      run(
        executeTool({
          db: fakeDb,
          name: "query_database",
          args: { query: "INSERT INTO users VALUES (1)" },
        }),
      ),
      /Only one SELECT query/,
    );
  });

  it("rejects missing query", async () => {
    await assert.rejects(
      run(executeTool({ db: fakeDb, name: "query_database", args: {} })),
      /query/,
    );
  });
});

describe("conversation thread tools", () => {
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
