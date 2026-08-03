import {
  DEFAULT_CORE_VERSION,
  DEFAULT_DISTRIBUTION_MODE,
  buildGeneratedFiles,
  generateApp,
} from "./generate.ts";
import type {
  BuildFilesOptions,
  DistributionMode,
  GenerateAppOptions,
  GenerateAppResult,
  GeneratedFile,
} from "./generate.ts";
import { buildCoreSourceHashIndex, scanGeneratedTreeForCopiedCoreSource } from "./guardrails.ts";
import type { GuardrailViolation } from "./guardrails.ts";
import { toSlug } from "./slug.ts";
import { helpText, parseArgs, run } from "./cli.ts";
import type { CliCommand, ParsedArgs } from "./cli.ts";
import {
  GENERATED_MANIFEST_PATH,
  GeneratedManifestSchema,
  decodeGeneratedManifest,
  hashGeneratedFileContents,
  serializeGeneratedManifest,
} from "./manifest.ts";
import type { GeneratedManifest } from "./manifest.ts";
import { inspectGeneratedAppUpgrade, upgradeGeneratedApp } from "./upgrade.ts";
import type {
  GeneratedAppUpgradePlan,
  GeneratedAppUpgradeResult,
  InspectUpgradeOptions,
  UpgradeAppOptions,
  UpgradeFileReport,
  UpgradeFileStatus,
} from "./upgrade.ts";

export {
  DEFAULT_CORE_VERSION,
  DEFAULT_DISTRIBUTION_MODE,
  GENERATED_MANIFEST_PATH,
  buildCoreSourceHashIndex,
  buildGeneratedFiles,
  decodeGeneratedManifest,
  generateApp,
  GeneratedManifestSchema,
  hashGeneratedFileContents,
  helpText,
  inspectGeneratedAppUpgrade,
  parseArgs,
  run,
  scanGeneratedTreeForCopiedCoreSource,
  serializeGeneratedManifest,
  toSlug,
  upgradeGeneratedApp,
};

export type {
  BuildFilesOptions,
  CliCommand,
  DistributionMode,
  GeneratedAppUpgradePlan,
  GeneratedAppUpgradeResult,
  GeneratedManifest,
  GenerateAppOptions,
  GenerateAppResult,
  GeneratedFile,
  GuardrailViolation,
  InspectUpgradeOptions,
  ParsedArgs,
  UpgradeAppOptions,
  UpgradeFileReport,
  UpgradeFileStatus,
};
