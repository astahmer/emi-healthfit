import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildGeneratedFiles, DEFAULT_CORE_VERSION, generateApp } from "../src/generate.ts";
import { inspectGeneratedAppUpgrade, upgradeGeneratedApp } from "../src/upgrade.ts";

const parsePackageJson = (files: { path: string; contents: string }[], path: string) => {
  const file = files.find((candidate) => candidate.path === path);
  assert.ok(file !== undefined, `expected generated file "${path}"`);
  return JSON.parse(file.contents) as { dependencies: Record<string, string> };
};

const parseManifest = (files: { path: string; contents: string }[]) => {
  const file = files.find((candidate) => candidate.path === "emi.generated.json");
  assert.ok(file !== undefined, "expected generated manifest");
  return JSON.parse(file.contents) as {
    application: { name: string; slug: string };
    coreVersion: string;
    distributionMode: string;
    managedFiles: Array<{ path: string; sha256: string }>;
  };
};

describe("upgrading the generated app's core dependency", () => {
  it("keeps @emi/* dependency names stable while the version string changes", () => {
    const before = buildGeneratedFiles({
      appName: "Upgrade Fixture",
      coreVersion: DEFAULT_CORE_VERSION,
      distributionMode: "dependency",
    });
    const after = buildGeneratedFiles({
      appName: "Upgrade Fixture",
      coreVersion: "0.2.0",
      distributionMode: "dependency",
    });

    const webBefore = parsePackageJson(before, "web/package.json");
    const webAfter = parsePackageJson(after, "web/package.json");
    const workerBefore = parsePackageJson(before, "worker/package.json");
    const workerAfter = parsePackageJson(after, "worker/package.json");

    assert.deepEqual(
      Object.keys(webBefore.dependencies).toSorted(),
      Object.keys(webAfter.dependencies).toSorted(),
    );
    assert.deepEqual(
      Object.keys(workerBefore.dependencies).toSorted(),
      Object.keys(workerAfter.dependencies).toSorted(),
    );

    assert.equal(webBefore.dependencies["@emi/core"], DEFAULT_CORE_VERSION);
    assert.equal(webAfter.dependencies["@emi/core"], "0.2.0");
    assert.equal(workerBefore.dependencies["@emi/core"], DEFAULT_CORE_VERSION);
    assert.equal(workerAfter.dependencies["@emi/core"], "0.2.0");
  });

  it("resolves the same @emi/* package names across a pinned-to-pinned bump", () => {
    const v1 = buildGeneratedFiles({
      appName: "Upgrade Fixture",
      coreVersion: "0.1.0",
      distributionMode: "dependency",
    });
    const v2 = buildGeneratedFiles({
      appName: "Upgrade Fixture",
      coreVersion: "0.2.0",
      distributionMode: "dependency",
    });

    for (const path of ["web/package.json", "worker/package.json"]) {
      const before = parsePackageJson(v1, path);
      const after = parsePackageJson(v2, path);
      const emiDepsBefore = Object.keys(before.dependencies).filter((name) =>
        name.startsWith("@emi/"),
      );
      const emiDepsAfter = Object.keys(after.dependencies).filter((name) =>
        name.startsWith("@emi/"),
      );
      assert.deepEqual(emiDepsBefore.toSorted(), emiDepsAfter.toSorted());
      for (const name of emiDepsBefore) {
        assert.equal(before.dependencies[name], "0.1.0");
        assert.equal(after.dependencies[name], "0.2.0");
      }
    }
  });

  it("records the generated app contract for a future safe upgrade", () => {
    const files = buildGeneratedFiles({
      appName: "Upgrade Fixture",
      coreVersion: "0.1.0",
      distributionMode: "owned",
    });
    const manifest = parseManifest(files);

    assert.deepEqual(manifest.application, {
      name: "Upgrade Fixture",
      slug: "upgrade-fixture",
    });
    assert.equal(manifest.coreVersion, "0.1.0");
    assert.equal(manifest.distributionMode, "owned");
    assert.ok(manifest.managedFiles.some((file) => file.path === "core/src/chat.export.ts"));
    assert.ok(manifest.managedFiles.some((file) => file.path === "web/src/app.tsx"));
    assert.ok(manifest.managedFiles.every((file) => file.sha256.length === 64));
  });

  it("updates only generated files that still match their recorded hashes", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "create-chat-app-upgrade-"));
    try {
      await generateApp({
        appName: "Upgrade Fixture",
        targetDir,
        coreVersion: "0.1.0",
        distributionMode: "dependency",
        force: true,
      });

      const plan = await inspectGeneratedAppUpgrade({ targetDir, coreVersion: "0.2.0" });
      assert.equal(plan.conflicts.length, 0);
      assert.equal(plan.files.find((file) => file.path === "web/package.json")?.status, "update");

      const result = await upgradeGeneratedApp({ targetDir, coreVersion: "0.2.0" });
      assert.equal(result.applied, true);
      const manifest = JSON.parse(
        await readFile(join(targetDir, "emi.generated.json"), "utf8"),
      ) as { coreVersion: string };
      assert.equal(manifest.coreVersion, "0.2.0");
    } finally {
      await rm(targetDir, { recursive: true, force: true });
    }
  });

  it("blocks modified files until force is explicit", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "create-chat-app-upgrade-conflict-"));
    const appPath = join(targetDir, "web/src/app.tsx");
    try {
      await generateApp({ appName: "Upgrade Fixture", targetDir, force: true });
      await writeFile(appPath, `${await readFile(appPath, "utf8")}\nconst userChange = true;\n`);

      const plan = await inspectGeneratedAppUpgrade({ targetDir, coreVersion: "0.2.0" });
      assert.equal(plan.files.find((file) => file.path === "web/src/app.tsx")?.status, "modified");

      const blocked = await upgradeGeneratedApp({ targetDir, coreVersion: "0.2.0" });
      assert.equal(blocked.applied, false);
      assert.match(await readFile(appPath, "utf8"), /userChange/);

      const forced = await upgradeGeneratedApp({ targetDir, coreVersion: "0.2.0", force: true });
      assert.equal(forced.applied, true);
      assert.doesNotMatch(await readFile(appPath, "utf8"), /userChange/);
    } finally {
      await rm(targetDir, { recursive: true, force: true });
    }
  });

  it("reports missing files and restores them without deleting stale files", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "create-chat-app-upgrade-missing-"));
    const appPath = join(targetDir, "web/src/app.css");
    const stalePath = join(targetDir, "custom-user-file.txt");
    try {
      await generateApp({ appName: "Upgrade Fixture", targetDir, force: true });
      await rm(appPath);
      await writeFile(stalePath, "keep me");

      const plan = await inspectGeneratedAppUpgrade({ targetDir, coreVersion: "0.2.0" });
      assert.equal(plan.files.find((file) => file.path === "web/src/app.css")?.status, "missing");
      assert.equal(plan.conflicts.length, 0);

      const result = await upgradeGeneratedApp({ targetDir, coreVersion: "0.2.0" });
      assert.equal(result.applied, true);
      assert.match(await readFile(appPath, "utf8"), /@import "@emi\/core\/styles\.css"/);
      assert.equal(await readFile(stalePath, "utf8"), "keep me");
    } finally {
      await rm(targetDir, { recursive: true, force: true });
    }
  });
});
