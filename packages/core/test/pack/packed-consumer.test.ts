import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = join(fileURLToPath(new URL("../..", import.meta.url)));
const repositoryRoot = join(packageRoot, "../..");

const run = (command: string, args: string[], cwd: string) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
};

describe("@emi/core packed consumer", () => {
  it("installs and imports built public subpaths without workspace source", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "emi-core-packed-"));
    try {
      const packageDestination = join(temporaryDirectory, "package");
      await execFileSync("pnpm", ["pack", "--pack-destination", temporaryDirectory], {
        cwd: packageRoot,
        stdio: "pipe",
      });
      const tarball = (await readdir(temporaryDirectory)).find((file) => file.endsWith(".tgz"));
      assert.ok(tarball !== undefined, "pnpm pack did not create a tarball");
      run("mkdir", ["-p", packageDestination], temporaryDirectory);
      run("tar", ["-xzf", join(temporaryDirectory, tarball), "-C", packageDestination], temporaryDirectory);

      const consumerDirectory = join(temporaryDirectory, "consumer");
      await writeFile(
        join(temporaryDirectory, "package.json"),
        JSON.stringify({ name: "packed-consumer", private: true, type: "module" }),
      );
      await writeFile(
        join(temporaryDirectory, "consumer-package.json"),
        JSON.stringify({
          name: "packed-consumer",
          private: true,
          type: "module",
          dependencies: { "@emi/core": `file:${join(temporaryDirectory, tarball)}` },
        }),
      );
      run("mkdir", ["-p", consumerDirectory], temporaryDirectory);
      await writeFile(join(consumerDirectory, "package.json"), await readFile(join(temporaryDirectory, "consumer-package.json")));
      run("pnpm", ["install", "--offline", "--ignore-scripts"], consumerDirectory);

      await writeFile(
        join(consumerDirectory, "index.mjs"),
        `const names = ["@emi/core", "@emi/core/protocol", "@emi/core/api", "@emi/core/runtime", "@emi/core/react", "@emi/core/components", "@emi/core/components/styled", "@emi/core/server", "@emi/core/server/effect", "@emi/core/server/fetch", "@emi/core/adapters/ai-sdk", "@emi/core/adapters/cloudflare", "@emi/core/extensions", "@emi/core/testing", "@emi/core/advanced/xstate"];\nfor (const name of names) { const module = await import(name); if (Object.keys(module).length === 0) throw new Error(name); }\n`,
      );
      run("node", ["index.mjs"], consumerDirectory);

      await writeFile(
        join(consumerDirectory, "index.ts"),
        `import { ChatProtocol } from "@emi/core/protocol";\nimport { CoreApiClient } from "@emi/core/api";\nimport { createChatRuntime } from "@emi/core";\nvoid ChatProtocol; void CoreApiClient; void createChatRuntime;\n`,
      );
      run(
        join(repositoryRoot, "node_modules/.bin/tsc"),
        [
          "--noEmit",
          "--target",
          "ESNext",
          "--module",
          "Preserve",
          "--moduleResolution",
          "Bundler",
          "--strict",
          "--skipLibCheck",
          "index.ts",
        ],
        consumerDirectory,
      );
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
