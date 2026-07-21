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
  });
  if (violations.length > 0) {
    console.error("Guardrail violations: generated fixture references copied core source.");
    for (const violation of violations) console.error(`  ${violation.file}: ${violation.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log("Guardrail check passed: no copied packages/core/src found.");

  console.log("\nTo fully verify (typecheck against real @emi/core package):");
  console.log("  pnpm install");
  console.log("  pnpm --filter generated-fixture-web typecheck");
  console.log("  pnpm --filter generated-fixture-worker typecheck");
};

await main();
