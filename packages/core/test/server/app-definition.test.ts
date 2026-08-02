import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppDefinitions, type AppDefinition } from "../../src/server/app-definition.ts";

describe("mergeAppDefinitions", () => {
  it("overrides identity fields with later definitions", () => {
    const core: AppDefinition = { identity: { name: "Core Chat", description: "core" } };
    const flavor: AppDefinition = { identity: { name: "HealthFit" } };
    const merged = AppDefinitions.merge(core, flavor);
    assert.deepEqual(merged.identity, { name: "HealthFit", description: "core" });
  });

  it("orders prompt contributors by explicit order, falling back to argument order", () => {
    const core: AppDefinition = {
      identity: { name: "Core Chat" },
      promptContributors: [{ id: "core-safety", order: 0, text: "safety" }],
    };
    const flavor: AppDefinition = {
      identity: { name: "HealthFit" },
      promptContributors: [
        { id: "coach", order: 10, text: "coach" },
        { id: "unordered", text: "unordered" },
      ],
    };
    const merged = AppDefinitions.merge(core, flavor);
    assert.deepEqual(
      merged.promptContributors?.map((contributor) => contributor.id),
      ["core-safety", "coach", "unordered"],
    );
  });

  it("keeps prompt contributors without an order in their original relative position", () => {
    const first: AppDefinition = {
      identity: { name: "a" },
      promptContributors: [
        { id: "a1", text: "a1" },
        { id: "a2", text: "a2" },
      ],
    };
    const second: AppDefinition = {
      identity: { name: "b" },
      promptContributors: [{ id: "b1", text: "b1" }],
    };
    const merged = AppDefinitions.merge(first, second);
    assert.deepEqual(
      merged.promptContributors?.map((contributor) => contributor.id),
      ["a1", "a2", "b1"],
    );
  });

  it("concatenates tool lists across definitions, keeping the earliest position for duplicates", () => {
    const objectSchema = { type: "object" as const, properties: {} };
    const core: AppDefinition = {
      identity: { name: "Core Chat" },
      tools: [{ name: "search_memories", description: "core version", parameters: objectSchema }],
    };
    const flavor: AppDefinition = {
      identity: { name: "HealthFit" },
      tools: [
        { name: "get_recovery", description: "flavor tool", parameters: objectSchema },
        { name: "search_memories", description: "flavor override", parameters: objectSchema },
      ],
    };
    const merged = AppDefinitions.merge(core, flavor);
    assert.deepEqual(
      merged.tools?.map((tool) => tool.name),
      ["search_memories", "get_recovery"],
    );
    assert.equal(
      merged.tools?.find((tool) => tool.name === "search_memories")?.description,
      "flavor override",
    );
  });

  it("returns empty prompt contributors and tools when no definitions declare any", () => {
    const merged = AppDefinitions.merge({ identity: { name: "Core Chat" } });
    assert.deepEqual(merged.promptContributors, []);
    assert.deepEqual(merged.tools, []);
  });
});

describe("composeSystemPrompt", () => {
  it("joins prompt contributor text with a blank line separator", () => {
    const prompt = AppDefinitions.composeSystemPrompt([
      { id: "a", text: "first" },
      { id: "b", text: "second" },
    ]);
    assert.equal(prompt, "first\n\nsecond");
  });

  it("returns an empty string when given no contributors", () => {
    assert.equal(AppDefinitions.composeSystemPrompt(undefined), "");
    assert.equal(AppDefinitions.composeSystemPrompt([]), "");
  });
});
