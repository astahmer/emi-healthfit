import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coreAppDefinition } from "@emi/core-server";
import { makeQueryDatabaseClient } from "@emi/platform-cloudflare";

describe("generic-worker composition", () => {
  it("resolves the core app definition through @emi/core-server", () => {
    assert.equal(coreAppDefinition.identity.name, "Core Chat");
    assert.deepEqual(coreAppDefinition.tools, []);
  });

  it("resolves the D1 query client factory through @emi/platform-cloudflare", () => {
    assert.equal(typeof makeQueryDatabaseClient, "function");
  });
});
