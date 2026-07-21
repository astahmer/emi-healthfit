import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const workerSourcePath = fileURLToPath(new URL("../src/api.worker.ts", import.meta.url));

describe("HealthFit Worker auth env", () => {
  it("does not bind ALLOW_DEMO_USER_HEADER on the HealthFit API Worker", async () => {
    const source = await readFile(workerSourcePath, "utf8");
    assert.equal(source.includes("ALLOW_DEMO_USER_HEADER"), false);
  });
});
