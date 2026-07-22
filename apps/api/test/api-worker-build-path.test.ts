import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("API worker build path", () => {
  it("does not depend on Node module URLs at Cloudflare Worker startup", async () => {
    const workerSource = await readFile(join(appRoot, "src", "api.worker.ts"), "utf8");
    assert.match(workerSource, /const chatAppDirectory = "\.\.\/chat"/);
    assert.doesNotMatch(workerSource, /fileURLToPath\(import\.meta\.url\)/);
  });
});
