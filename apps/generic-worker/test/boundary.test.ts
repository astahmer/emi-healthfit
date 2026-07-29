import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const srcRoot = join(appRoot, "src");

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

const forbiddenPatterns = ["flavor-healthfit", "healthfit", "apps/api", "apps/chat"];

describe("generic-worker boundary", () => {
  it("never imports flavor-healthfit or another app's source from src/", async () => {
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

  it("does not declare @emi/flavor-healthfit as a dependency", async () => {
    const packageJson = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    assert.equal("@emi/flavor-healthfit" in (packageJson.dependencies ?? {}), false);
    assert.equal("@emi/flavor-healthfit" in (packageJson.devDependencies ?? {}), false);
  });
});
