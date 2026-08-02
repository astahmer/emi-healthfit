import assert from "node:assert";
import { describe, it } from "node:test";
import { RuntimeContext } from "alchemy";
import { HealthFit } from "@emi/flavor-healthfit";
import * as Effect from "effect/Effect";

const { execute: executeTool } = HealthFit.tools;

const fakeDb = {} as never;

const run = <A, E>(effect: Effect.Effect<A, E, RuntimeContext>) =>
  Effect.runPromise(effect.pipe(Effect.provide(RuntimeContext.phantom)));

describe("render_component tool", () => {
  it("returns a json-render spec with elements map", async () => {
    const result = await run(
      executeTool({
        db: fakeDb,
        userId: "test-user",
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

  it("rejects MetricCard props outside the current contract", async () => {
    await assert.rejects(
      run(
        executeTool({
          db: fakeDb,
          userId: "test-user",
          name: "render_component",
          args: {
            component: "MetricCard",
            props: { value: 8742, unit: "steps/day", trend: "stable" },
          },
        }),
      ),
      /Invalid MetricCard props/,
    );
  });

  it("fails when component name is missing", async () => {
    await assert.rejects(
      run(
        executeTool({
          db: fakeDb,
          userId: "test-user",
          name: "render_component",
          args: { props: {} },
        }),
      ),
      /component/,
    );
  });

  it("rejects the session-9745 WorkoutTable.sessions mismatch at the tool boundary", async () => {
    await assert.rejects(
      run(
        executeTool({
          db: fakeDb,
          userId: "test-user",
          name: "render_component",
          args: {
            component: "WorkoutTable",
            props: { sessions: [{ id: "session-1" }] },
          },
        }),
      ),
      /Invalid WorkoutTable props/,
    );
  });
});
