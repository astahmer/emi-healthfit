import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { generateApp } from "../src/generate.ts";
import {
  buildCoreSourceHashIndex,
  scanGeneratedTreeForCopiedCoreSource,
} from "../src/guardrails.ts";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = join(packageDir, "..", "..");

describe("generated fixture keeps owned source boundaries explicit", () => {
  let targetDir = "";

  before(async () => {
    targetDir = await mkdtemp(join(tmpdir(), "create-chat-app-boundary-"));
    await generateApp({ appName: "Boundary Fixture", targetDir, force: true });
  });

  after(async () => {
    if (targetDir !== "") await rm(targetDir, { recursive: true, force: true });
  });

  it("hashes every non-owned generated file against core sources and finds no copy", async () => {
    const coreSourceHashes = await buildCoreSourceHashIndex(repoRoot);
    assert.ok(
      coreSourceHashes.size > 0,
      "expected to find core package source files to hash against",
    );

    const violations = await scanGeneratedTreeForCopiedCoreSource({
      generatedRoot: targetDir,
      coreSourceHashes,
      ownedCore: true,
    });
    assert.deepEqual(violations, []);
  });

  it("only references core packages by name, never by a distinctive internal path", async () => {
    const distinctivePaths = ["packages/core/src", "apps/api/src", "apps/chat/src"];
    const coreSourceHashes = await buildCoreSourceHashIndex(repoRoot);
    const violations = await scanGeneratedTreeForCopiedCoreSource({
      generatedRoot: targetDir,
      coreSourceHashes,
      ownedCore: true,
    });
    const pathViolations = violations.filter((violation) =>
      distinctivePaths.some((distinctivePath) => violation.reason.includes(distinctivePath)),
    );
    assert.deepEqual(pathViolations, []);
  });
});
