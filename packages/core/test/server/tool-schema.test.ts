import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as Tool from "effect/unstable/ai/Tool";
import * as Toolkit from "effect/unstable/ai/Toolkit";
import { ToolSchema } from "../../src/server/tool-schema.ts";

const parameters = Schema.Struct({
  count: ToolSchema.optional(Schema.Int),
  label: ToolSchema.optional(Schema.String),
});

describe("ToolSchema", () => {
  it("normalizes explicit null optional arguments to undefined", () => {
    assert.deepEqual(Schema.decodeUnknownSync(parameters)({}), {});
    assert.deepEqual(Schema.decodeUnknownSync(parameters)({ count: null, label: null }), {
      count: undefined,
      label: undefined,
    });
    assert.deepEqual(Schema.decodeUnknownSync(parameters)({ count: 3, label: "sets" }), {
      count: 3,
      label: "sets",
    });
    assert.throws(() => Schema.decodeUnknownSync(parameters)({ count: "3" }));
  });

  it("publishes nullable optional properties for model providers", () => {
    const definition = Tool.getJsonSchema(
      Tool.make("example", {
        parameters,
        success: Schema.Unknown,
        failure: Schema.Unknown,
      }),
    );

    assert.equal(definition.type, "object");
    assert.deepEqual(definition.required, undefined);
    const countProperty = Object.entries(definition.properties ?? {}).find(
      ([name]) => name === "count",
    )?.[1];
    assert.deepEqual(countProperty, {
      anyOf: [{ type: "integer" }, { type: "null" }],
    });
  });

  it("lets Toolkit decode explicit null before invoking the handler", async () => {
    const tool = Tool.make("example", {
      parameters,
      success: Schema.String,
      failure: Schema.Unknown,
    });
    const toolkit = Toolkit.make(tool);
    const runtime = await Effect.runPromise(
      toolkit.pipe(
        Effect.provide(
          toolkit.toLayer(
            toolkit.of({
              example: ({ count, label }) =>
                Effect.succeed(`${count ?? "none"}:${label ?? "none"}`),
            }),
          ),
        ),
      ),
    );
    const output = await Effect.runPromise(
      runtime
        .handle("example", { count: null, label: null } as never)
        .pipe(Stream.unwrap, Stream.run(Sink.last()), Effect.flatMap(Effect.fromOption)),
    );

    assert.equal(output.result, "none:none");
    assert.equal(output.encodedResult, "none:none");
  });
});
