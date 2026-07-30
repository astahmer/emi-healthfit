import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { generateApp } from "../packages/create-chat-app/src/generate.ts";
import {
  buildCoreSourceHashIndex,
  scanGeneratedTreeForCopiedCoreSource,
} from "../packages/create-chat-app/src/guardrails.ts";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const targetDir = join(repoRoot, "apps", "generated-fixture");

const main = async () => {
  await rm(targetDir, { recursive: true, force: true });
  const { files } = await generateApp({
    appName: "generated-fixture",
    targetDir,
    force: true,
  });
  console.log(`Generated ${files.length} files into ${targetDir}`);

  const coreSourceHashes = await buildCoreSourceHashIndex(repoRoot);
  const violations = await scanGeneratedTreeForCopiedCoreSource({
    generatedRoot: targetDir,
    coreSourceHashes,
    ownedCore: true,
  });
  if (violations.length > 0) {
    console.error("Guardrail violations: generated fixture leaks core source outside owned core/.");
    for (const violation of violations) console.error(`  ${violation.file}: ${violation.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log("Guardrail check passed: copied core is limited to owned core/.");

  console.log("\nTo fully verify:");
  console.log("  pnpm install");
  console.log("  pnpm typecheck");
};

await main();
