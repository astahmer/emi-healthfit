import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const packageRoot = process.cwd();

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

describe("@emi/flavor-healthfit isolation", () => {
  it("never imports apps/api or apps/chat source", async () => {
    const files = await walk(join(packageRoot, "src"));
    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const pattern of ["apps/api", "apps/chat", "@/", "../../apps/"]) {
        if (source.includes(pattern)) {
          violations.push(`${file.replace(packageRoot + "/", "")}: ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("exports ingested-data and data-transfer from the package root", async () => {
    const source = await readFile(join(packageRoot, "src/index.ts"), "utf8");
    expect(source).toContain("./db/ingested-data.ts");
    expect(source).toContain("./ingest/data-transfer.ts");
  });

  it("does not import @emi/core/web from non-web entry sources", async () => {
    const files = await walk(join(packageRoot, "src"));
    const violations: string[] = [];
    for (const file of files) {
      if (file.endsWith("contributions.tsx") || file.includes("/components/")) continue;
      if (file.endsWith("web.ts")) continue;
      const source = await readFile(file, "utf8");
      if (source.includes("@emi/core/web")) {
        violations.push(file.replace(packageRoot + "/", ""));
      }
    }
    expect(violations).toEqual([]);
  });
});
