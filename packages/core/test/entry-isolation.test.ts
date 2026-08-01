import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = join(fileURLToPath(new URL("..", import.meta.url)));

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

const assertNoMatches = async (options: {
  entry: string;
  forbidden: ReadonlyArray<string | RegExp>;
}) => {
  const srcRoot = join(packageRoot, "src", options.entry);
  const files = await walk(srcRoot);
  const violations: string[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const lower = source.toLowerCase();
    for (const pattern of options.forbidden) {
      const matched =
        typeof pattern === "string" ? lower.includes(pattern.toLowerCase()) : pattern.test(source);
      if (matched)
        violations.push(`${file.replace(srcRoot, `src/${options.entry}`)}: ${String(pattern)}`);
    }
  }
  assert.deepEqual(violations, []);
};

describe("@emi/core entry isolation", () => {
  it("contract never imports server, web, cloudflare, discord, or react", async () => {
    await assertNoMatches({
      entry: "contract",
      forbidden: [
        "@emi/core/server",
        "@emi/core/web",
        "@emi/core/cloudflare",
        "@emi/core/discord",
        'from "react"',
        "from 'react'",
        "drizzle-orm",
        "kysely",
        "alchemy",
      ],
    });
  });

  it("chat never imports server, web, cloudflare, discord, or react", async () => {
    await assertNoMatches({
      entry: "chat",
      forbidden: [
        "@emi/core/server",
        "@emi/core/web",
        "@emi/core/cloudflare",
        "@emi/core/discord",
        'from "react"',
        "from 'react'",
        "drizzle-orm",
        "kysely",
        "alchemy",
      ],
    });
  });

  it("server never imports web, chat, discord, or react", async () => {
    await assertNoMatches({
      entry: "server",
      forbidden: [
        "@emi/core/web",
        "@emi/core/chat",
        "@emi/core/discord",
        'from "react"',
        "from 'react'",
        ".tsx",
      ],
    });
  });

  it("web never imports server, cloudflare, or discord", async () => {
    await assertNoMatches({
      entry: "web",
      forbidden: ["@emi/core/server", "@emi/core/cloudflare", "@emi/core/discord", "drizzle-orm"],
    });
  });

  it("headless web entry does not pull the optional styled bundle", async () => {
    const source = await readFile(join(packageRoot, "src", "web", "index.ts"), "utf8");

    assert.doesNotMatch(source, /styled|lucide-react|radix-ui/);
  });

  it("discord never imports web, flavor, or react", async () => {
    await assertNoMatches({
      entry: "discord",
      forbidden: [
        "@emi/core/web",
        "flavor-healthfit",
        'from "react"',
        "from 'react'",
        "apps/chat",
        "apps/api",
      ],
    });
  });

  it("loads node-compatible public subpaths through package exports", async () => {
    const subpaths = ["chat", "cloudflare", "contract", "discord", "server"];
    const modules = await Promise.all(subpaths.map((subpath) => import(`@emi/core/${subpath}`)));
    assert.equal(modules.length, subpaths.length);
    for (const module of modules) assert.ok(Object.keys(module).length > 0);
  });
});
