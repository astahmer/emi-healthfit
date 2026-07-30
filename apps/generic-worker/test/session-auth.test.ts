import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

describe("generic-worker session auth", () => {
  it("wires authenticateWorkerFetch instead of the demo user header", async () => {
    const source = await readFile(join(appRoot, "src/generic.worker.ts"), "utf8");
    assert.match(source, /authenticateWorkerFetch/);
    assert.match(source, /policy:\s*"anonymous"/);
    assert.match(source, /isGenericProtectedPath/);
    assert.match(source, /makeGenericChatRoutes/);
    assert.doesNotMatch(source, /x-demo-user-id/);
  });

  it("includes auth and resumable-generation tables in the drizzle schema", async () => {
    const source = await readFile(join(appRoot, "src/db/schema.ts"), "utf8");
    assert.match(source, /authUser/);
    assert.match(source, /AuthDatabaseSchema/);
    assert.match(source, /chatGenerations/);
    assert.match(source, /chatGenerationChunks/);
  });
});
