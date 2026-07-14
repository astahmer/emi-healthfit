import assert from "node:assert";
import { describe, it } from "node:test";
import { executeTool } from "../src/tools/api.ts";
import * as Effect from "effect/Effect";

const fakeDb = {} as never;

const run = <A>(effect: Effect.Effect<A>) => Effect.runPromise(effect);

describe("query_database tool", () => {
  it("rejects write commands", async () => {
    await assert.rejects(
      run(executeTool(fakeDb, "query_database", { query: "DELETE FROM users" })),
      /Only read-only queries/,
    );

    await assert.rejects(
      run(executeTool(fakeDb, "query_database", { query: "INSERT INTO users VALUES (1)" })),
      /Only read-only queries/,
    );
  });

  it("rejects missing query", async () => {
    await assert.rejects(
      run(executeTool(fakeDb, "query_database", {})),
      /query is required/,
    );
  });
});
