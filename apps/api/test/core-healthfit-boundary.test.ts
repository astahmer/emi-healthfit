import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const sourceRoot = join(fileURLToPath(new URL("../src", import.meta.url)));
const legacyCoreRoot = join(sourceRoot, "core");
const chatRoot = join(sourceRoot, "chat");

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

describe("API domain boundaries", () => {
  it("keeps the legacy core namespace removed and chat modules generic", async () => {
    await assert.rejects(access(legacyCoreRoot));
    const files = await walk(chatRoot);
    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (source.includes("@emi/flavor-healthfit")) {
        violations.push(file.replace(sourceRoot, "src"));
      }
    }
    assert.deepEqual(violations, []);
  });
});
