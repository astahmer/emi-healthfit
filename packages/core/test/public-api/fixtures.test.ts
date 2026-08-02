import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtureConfigs = [
  join(packageRoot, "test", "fixtures", "tsconfig.json"),
  join(packageRoot, "test", "fixtures", "packed", "tsconfig.json"),
];

const compileFixtureConfig = (config: string) =>
  spawnSync("pnpm", ["exec", "tsc", "--noEmit", "-p", config], {
    cwd: packageRoot,
    encoding: "utf8",
  });

describe("@emi/core R0 consumer fixtures", () => {
  it("compiles the target consumer and rewrite-gate fixtures", () => {
    for (const fixtureConfig of fixtureConfigs) {
      const result = compileFixtureConfig(fixtureConfig);
      assert.equal(
        result.status,
        0,
        [result.stdout, result.stderr].filter(Boolean).join("\n") || "fixture typecheck failed",
      );
    }
  });
});
