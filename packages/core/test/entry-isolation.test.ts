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

  it("loads node-compatible public subpaths through package exports", async () => {
    const subpaths = [
      "api",
      "adapters/cloudflare",
      "adapters/ai-sdk",
      "advanced/xstate",
      "components",
      "components/styled",
      "extensions",
      "protocol",
      "react",
      "runtime",
      "server",
      "server/effect",
      "server/fetch",
      "testing",
      "web",
    ];
    const modules = await Promise.all([
      import("@emi/core"),
      ...subpaths.map((subpath) => import(`@emi/core/${subpath}`)),
    ]);
    assert.equal(modules.length, subpaths.length + 1);
    for (const module of modules) assert.ok(Object.keys(module).length > 0);
  });

  it("keeps raw XState actors on the explicit advanced entrypoint", async () => {
    const web = await import("@emi/core/web");
    for (const name of [
      "browserStateActor",
      "chatRuntimeMachine",
      "chatSessionMachine",
      "chatTransportActor",
      "chatUiActor",
      "conversationStoreActor",
      "genericChatAppMachine",
      "settingsActor",
    ]) assert.equal(name in web, false, name);
  });
});
