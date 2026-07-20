import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const srcRoot = join(fileURLToPath(new URL("../src", import.meta.url)));

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
};

const forbiddenPatterns = ["apps/chat", "apps/api", "flavor-healthfit"];

describe("core-contract boundary", () => {
  it("never imports the chat app, the API worker, or the healthfit flavor package", async () => {
    const files = await walk(srcRoot);
    const violations: string[] = [];
    for (const file of files) {
      const source = (await readFile(file, "utf8")).toLowerCase();
      for (const pattern of forbiddenPatterns) {
        if (source.includes(pattern))
          violations.push(`${file.replace(srcRoot, "src")}: ${pattern}`);
      }
    }
    assert.deepEqual(violations, []);
  });
});
