import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
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

describe("generic-web boundary", () => {
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
    expect(violations).toEqual([]);
  });

  it("does not declare @emi/flavor-healthfit as a dependency", async () => {
    const packageJson = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect("@emi/flavor-healthfit" in (packageJson.dependencies ?? {})).toBe(false);
    expect("@emi/flavor-healthfit" in (packageJson.devDependencies ?? {})).toBe(false);
  });

  it("keeps application state in composed actors and opts into the target styled entrypoint", async () => {
    const source = await readFile(join(srcRoot, "app.tsx"), "utf8");
    expect(source).toMatch(/@emi\/core\/components\/styled/);
    expect(source).not.toMatch(/\buseState\b|\buseEffect\b/);
  });
});
