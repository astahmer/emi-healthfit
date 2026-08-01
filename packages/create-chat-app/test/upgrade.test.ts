import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildGeneratedFiles, DEFAULT_CORE_VERSION } from "../src/generate.ts";

const parsePackageJson = (files: { path: string; contents: string }[], path: string) => {
  const file = files.find((candidate) => candidate.path === path);
  assert.ok(file !== undefined, `expected generated file "${path}"`);
  return JSON.parse(file.contents) as { dependencies: Record<string, string> };
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
});
