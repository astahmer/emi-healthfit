import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import {
  GenerationAlreadyActiveError,
  isUniqueConstraintError,
} from "../src/core/chat/generation-store.ts";

describe("generation conflict helpers", () => {
  it("detects SQLite unique constraint messages", () => {
    assert.equal(isUniqueConstraintError(new Error("UNIQUE constraint failed: idx")), true);
    assert.equal(isUniqueConstraintError(new Error("constraint failed")), true);
    assert.equal(isUniqueConstraintError(new Error("network down")), false);
  });

  it("builds a tagged already-active error for 409 mapping", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.fail(
        new GenerationAlreadyActiveError({
          conversationId: "conversation-1",
          generationId: "generation-1",
        }),
      ),
    );
    assert.equal(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      assert.match(String(exit.cause), /GenerationAlreadyActiveError/);
    }
  });
});
