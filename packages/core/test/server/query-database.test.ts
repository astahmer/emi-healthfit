import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { QueryDatabase } from "../../src/server/db/query-database.ts";

describe("QueryDatabase", () => {
  it("maps rejected query Promises into the tagged database error channel", async () => {
    const result = await Effect.runPromiseExit(
      QueryDatabase.tryPromise(() => Promise.reject(new Error("database unavailable"))),
    );

    assert.equal(result._tag, "Failure");
    if (result._tag !== "Failure") return;
    const reason = result.cause.reasons[0];
    assert.equal(reason?._tag, "Fail");
    if (reason?._tag !== "Fail") return;
    assert.equal(reason.error._tag, "DatabaseQueryError");
    assert.equal(reason.error.message, "database unavailable");
  });
});
