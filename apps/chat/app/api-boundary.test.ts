import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, it } from "vitest";
import { fileURLToPath } from "node:url";

const chatRoot = dirname(fileURLToPath(import.meta.url));

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
};

describe("chat API boundary", () => {
  it("does not import Worker implementation under apps/api/src", async () => {
    const appRoot = join(chatRoot, "..");
    const files = await walk(appRoot);
    const violations: string[] = [];
    for (const file of files) {
      if (file.endsWith("api-boundary.test.ts")) continue;
      const source = await readFile(file, "utf8");
      if (source.includes("apps/api/src") || /from ["'].*\/api\/src\//.test(source)) {
        violations.push(file.replace(appRoot, "chat"));
      }
    }
    assert.deepEqual(violations, []);
  });
});
