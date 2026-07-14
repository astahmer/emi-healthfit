import assert from "node:assert";
import { describe, it } from "node:test";
import { extractTextFromLlmResponse } from "../src/chat/handler.ts";
import { executeTool } from "../src/tools/api.ts";
import * as Effect from "effect/Effect";

const fakeDb = {} as never;

const run = <A>(effect: Effect.Effect<A>) => Effect.runPromise(effect);

describe("extractTextFromLlmResponse", () => {
  it("extracts assistant content from chat completion shape", () => {
    const text = extractTextFromLlmResponse({
      choices: [
        {
          message: {
            role: "assistant",
            content: "hello",
          },
        },
      ],
    });
    assert.strictEqual(text, "hello");
  });

  it("extracts text from Workers AI shape", () => {
    const text = extractTextFromLlmResponse({ response: "world" });
    assert.strictEqual(text, "world");
  });

  it("returns null for malformed responses", () => {
    assert.strictEqual(extractTextFromLlmResponse(null), null);
    assert.strictEqual(extractTextFromLlmResponse({ choices: [] }), null);
    assert.strictEqual(extractTextFromLlmResponse({ error: "bad" }), null);
  });
});

describe("render_component tool", () => {
  it("returns a json-render spec with elements map", async () => {
    const result = await run(
      executeTool({
        db: fakeDb,
        name: "render_component",
        args: {
          component: "MetricCard",
          props: { label: "Volume", value: 1000, unit: "kg" },
        },
      }),
    );

    assert.ok(result && typeof result === "object");
    assert.ok("spec" in result);
    const spec = (result as { spec: Record<string, unknown> }).spec;
    assert.strictEqual(spec.root, "root");
    assert.ok(typeof spec.elements === "object" && spec.elements !== null);
    const root = (spec.elements as Record<string, unknown>).root as Record<string, unknown>;
    assert.strictEqual(root.type, "MetricCard");
    assert.deepStrictEqual(root.props, { label: "Volume", value: 1000, unit: "kg" });
  });

  it("fails when component name is missing", async () => {
    await assert.rejects(
      run(executeTool({ db: fakeDb, name: "render_component", args: { props: {} } })),
      /component/,
    );
  });
});
