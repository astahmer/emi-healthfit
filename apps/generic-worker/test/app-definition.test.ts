import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { makeGenericChatRoutes, makeQueryDatabaseClient } from "@emi/core/cloudflare";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

describe("generic-worker chat composition", () => {
  it("registers persistent stream and resume endpoints through the core route factory", async () => {
    const source = await readFile(join(appRoot, "src/generic.worker.ts"), "utf8");

    assert.match(source, /"POST", "\/api\/chat"/);
    assert.match(source, /"GET", "\/api\/chat\/:conversationId\/stream"/);
    assert.match(source, /"PATCH", "\/api\/conversations\/:conversationId"/);
    assert.match(source, /"POST", "\/api\/conversations\/:conversationId\/clone"/);
    assert.match(source, /makeGenericChatRoutes/);
  });

  it("resolves the D1 query client factory through @emi/core/cloudflare", () => {
    assert.equal(typeof makeQueryDatabaseClient, "function");
    assert.equal(typeof makeGenericChatRoutes, "function");
  });
});
