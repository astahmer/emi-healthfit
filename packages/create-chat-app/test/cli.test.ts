import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { generateApp } from "../src/generate.ts";
import { helpText, parseArgs } from "../src/cli.ts";

describe("parseArgs", () => {
  it("reads a positional app name plus flags", () => {
    const args = parseArgs([
      "my-app",
      "--dir",
      "/tmp/out",
      "--core-version",
      "1.0.0",
      "--mode",
      "dependency",
      "--force",
    ]);
    assert.equal(args.name, "my-app");
    assert.equal(args.dir, "/tmp/out");
    assert.equal(args.coreVersion, "1.0.0");
    assert.equal(args.distributionMode, "dependency");
    assert.equal(args.force, true);
    assert.equal(args.dryRun, false);
  });

  it("reads --name and --dry-run", () => {
    const args = parseArgs(["--name", "acme", "--dry-run"]);
    assert.equal(args.name, "acme");
    assert.equal(args.dryRun, true);
  });

  it("recognizes --help", () => {
    assert.equal(parseArgs(["--help"]).help, true);
    assert.ok(helpText.includes("create-chat-app"));
  });

  it("rejects an unknown distribution mode", () => {
    assert.throws(() => parseArgs(["--mode", "registry"]), /Unknown distribution mode/);
  });
});

describe("running the scaffolder into a real temp directory", () => {
  const tempDirs: string[] = [];

  after(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("writes a standalone owned workspace with typecheck scripts", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "create-chat-app-cli-"));
    tempDirs.push(targetDir);

    const { files } = await generateApp({ appName: "Temp Fixture", targetDir, force: true });
    assert.ok(files.length > 0);

    for (const file of files) {
      assert.ok(existsSync(join(targetDir, file.path)), `expected ${file.path} to exist on disk`);
    }

    const webPackageJson = JSON.parse(
      await readFile(join(targetDir, "web/package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const workerPackageJson = JSON.parse(
      await readFile(join(targetDir, "worker/package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    assert.equal(webPackageJson.scripts.typecheck, "tsc --noEmit");
    assert.equal(workerPackageJson.scripts.typecheck, "tsc --noEmit");
    assert.ok(existsSync(join(targetDir, "core/src/chat.export.ts")));
    assert.ok(existsSync(join(targetDir, "pnpm-workspace.yaml")));
  });

  it("refuses to overwrite a non-empty target directory without force", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "create-chat-app-cli-noforce-"));
    tempDirs.push(targetDir);

    await generateApp({ appName: "First", targetDir, force: true });
    await assert.rejects(() => generateApp({ appName: "Second", targetDir }));
  });

  it("dry-run reports the file list without writing to disk", async () => {
    const targetDir = join(
      await mkdtemp(join(tmpdir(), "create-chat-app-cli-dry-")),
      "unused-child",
    );
    tempDirs.push(targetDir);

    const { files } = await generateApp({ appName: "Dry Run", targetDir, dryRun: true });
    assert.ok(files.length > 0);
    assert.equal(existsSync(targetDir), false);
  });
});

describe("readdir sanity", () => {
  it("web and worker directories are siblings, not nested under each other", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "create-chat-app-cli-siblings-"));
    try {
      await generateApp({ appName: "Siblings", targetDir, force: true });
      const entries = await readdir(targetDir);
      assert.ok(entries.includes("web"));
      assert.ok(entries.includes("worker"));
    } finally {
      await rm(targetDir, { recursive: true, force: true });
    }
  });
});
