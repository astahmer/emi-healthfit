import assert from "node:assert";
import { describe, it } from "node:test";
import { executeTool } from "../src/tools/api.ts";
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
