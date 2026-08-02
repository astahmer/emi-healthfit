import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Effect } from "effect";
import * as Schema from "effect/Schema";
import { ChatExtensionError, ChatExtensions } from "../../src/extensions/index.ts";

const definition = (id: string, namespace = `${id}.chat`) =>
  ChatExtensions.define({
    id,
    namespace,
    parts: {
      [`${namespace}.card`]: Schema.Struct({ title: Schema.String }),
    },
  });

describe("ChatExtensions", () => {
  it("validates namespaced schemas and keeps the failure channel typed", async () => {
    const extension = await ChatExtensions.runPromise(definition("example"));
    const decoded = await ChatExtensions.runPromise(
      ChatExtensions.decodePart({
        extension,
        name: "example.chat.card",
        value: { title: "A card" },
      }),
    );
    assert.deepEqual(decoded, { title: "A card" });

    const invalid = await Effect.runPromiseExit(
      ChatExtensions.decodePart({
        extension,
        name: "example.chat.card",
        value: { title: 42 },
      }),
    );
    assert.equal(invalid._tag, "Failure");
    if (invalid._tag === "Failure") {
      const reason = invalid.cause.reasons[0];
      assert.equal(reason?._tag, "Fail");
      if (reason?._tag === "Fail") assert.equal(reason.error instanceof ChatExtensionError, true);
    }
  });

  it("rejects extension and contribution namespace collisions", async () => {
    const first = await ChatExtensions.runPromise(definition("first", "example.chat"));
    const second = await ChatExtensions.runPromise(definition("second", "example.chat"));
    const collision = await Effect.runPromiseExit(ChatExtensions.compose([first, second]));

    assert.equal(collision._tag, "Failure");
    if (collision._tag === "Failure") {
      const reason = collision.cause.reasons[0];
      assert.equal(reason?._tag, "Fail");
      if (reason?._tag === "Fail") assert.equal(reason.error.kind, "collision");
    }
  });

  it("orders independent extensions deterministically", async () => {
    const zulu = await ChatExtensions.runPromise(definition("zulu", "zulu.chat"));
    const alpha = await ChatExtensions.runPromise(definition("alpha", "alpha.chat"));
    const composed = await ChatExtensions.runPromise(ChatExtensions.compose([zulu, alpha]));
    assert.deepEqual(
      composed.map((extension) => extension.id),
      ["alpha", "zulu"],
    );
  });
});
