import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = join(fileURLToPath(new URL("../..", import.meta.url)));

const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));

describe("@emi/core R7 distribution manifest", () => {
  it("derives built exports and source mode from the same catalog", async () => {
    const packageJson = await readJson(join(packageRoot, "package.json"));
    const sourceManifest = await readJson(join(packageRoot, "source-manifest.json"));
    const targetEntrypoints = Object.keys(packageJson.emi.publicApi.entrypointPaths);
    const manifestNames = new Set(
      sourceManifest.entrypoints
        .filter((entry: { legacy?: boolean }) => entry.legacy !== true)
        .map((entry: { name: string }) => entry.name),
    );

    assert.equal(packageJson.private, false);
    assert.deepEqual([...manifestNames].toSorted(), [...targetEntrypoints].toSorted());
    for (const entrypoint of targetEntrypoints) {
      const exportValue = packageJson.exports[entrypoint];
      const importPath = typeof exportValue === "string" ? exportValue : exportValue.import;
      assert.equal(importPath.includes("/src/"), false, entrypoint);
      await access(join(packageRoot, importPath));
    }
    const publicSource = await Promise.all(
      sourceManifest.entrypoints
        .filter((entry: { legacy?: boolean }) => entry.legacy !== true)
        .map(async (entry: { source: string }) => readFile(join(packageRoot, entry.source), "utf8")),
    );
    assert.equal(publicSource.some((source) => /export \*/.test(source)), false);
    assert.equal(sourceManifest.provenance, "@emi/core source catalog r0");
    assert.ok(sourceManifest.sourceFiles.includes("src/index.ts"));
    assert.ok(sourceManifest.testFiles.includes("test/public-api/fixtures.test.ts"));
  });
});
