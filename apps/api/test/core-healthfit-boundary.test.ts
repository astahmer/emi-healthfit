import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const coreRoot = join(fileURLToPath(new URL("../src/core", import.meta.url)));

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.name.endsWith(".ts")) files.push(path);
  }
  return files;
};

describe("core/healthfit boundary", () => {
  it("keeps core modules free of healthfit imports", async () => {
    const files = await walk(coreRoot);
    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (source.includes("healthfit/")) {
        violations.push(file.replace(coreRoot, "core"));
      }
    }
    assert.deepEqual(violations, []);
  });
});
