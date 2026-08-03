import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  GENERATED_MANIFEST_PATH,
  decodeGeneratedManifest,
  hashGeneratedFileContents,
} from "./manifest.ts";
import { buildGeneratedFiles } from "./generate.ts";
import type { GeneratedFile } from "./generate.ts";

export type UpgradeFileStatus =
  | "unchanged"
  | "update"
  | "modified"
  | "missing"
  | "new"
  | "untracked"
  | "stale";

export interface UpgradeFileReport {
  path: string;
  status: UpgradeFileStatus;
  currentSha256?: string;
  previousSha256?: string;
  nextSha256?: string;
}

export interface InspectUpgradeOptions {
  targetDir: string;
  coreVersion?: string;
}

export interface UpgradeAppOptions extends InspectUpgradeOptions {
  dryRun?: boolean;
  force?: boolean;
}

export interface GeneratedAppUpgradePlan {
  targetDir: string;
  applicationName: string;
  distributionMode: "dependency" | "owned";
  currentCoreVersion: string;
  nextCoreVersion: string;
  files: UpgradeFileReport[];
  conflicts: UpgradeFileReport[];
  hasChanges: boolean;
}

export interface GeneratedAppUpgradeResult {
  plan: GeneratedAppUpgradePlan;
  applied: boolean;
}

const pathParts = (path: string): string[] => path.split("/");

const isSafeGeneratedPath = (path: string): boolean => {
  const parts = pathParts(path);
  return (
    path !== "" &&
    !path.startsWith("/") &&
    parts.every((part) => part !== "" && part !== "." && part !== "..")
  );
};

const targetPath = (targetDir: string, path: string): string => {
  if (!isSafeGeneratedPath(path)) throw new Error(`Unsafe generated file path: ${path}`);
  return join(targetDir, ...pathParts(path));
};

const readTargetFile = async (targetDir: string, path: string): Promise<string | undefined> => {
  try {
    return await readFile(targetPath(targetDir, path), "utf8");
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
    throw cause;
  }
};

const readManifest = async (targetDir: string) => {
  const contents = await readTargetFile(targetDir, GENERATED_MANIFEST_PATH);
  if (contents === undefined) {
    throw new Error(
      `Generated app manifest not found at ${targetPath(targetDir, GENERATED_MANIFEST_PATH)}`,
    );
  }
  return decodeGeneratedManifest(contents);
};

const desiredFilesFor = ({
  applicationName,
  distributionMode,
  coreVersion,
}: {
  applicationName: string;
  distributionMode: "dependency" | "owned";
  coreVersion: string;
}): GeneratedFile[] =>
  buildGeneratedFiles({
    appName: applicationName,
    distributionMode,
    coreVersion,
  });

const reportFile = async ({
  targetDir,
  desiredFile,
  previousSha256,
  nextSha256,
}: {
  targetDir: string;
  desiredFile: GeneratedFile;
  previousSha256: string | undefined;
  nextSha256: string;
}): Promise<UpgradeFileReport> => {
  const currentContents = await readTargetFile(targetDir, desiredFile.path);
  if (currentContents === undefined) {
    return {
      path: desiredFile.path,
      status: previousSha256 === undefined ? "new" : "missing",
      previousSha256,
      nextSha256,
    };
  }

  const currentSha256 = hashGeneratedFileContents(currentContents);
  if (currentSha256 === nextSha256) {
    return {
      path: desiredFile.path,
      status: "unchanged",
      currentSha256,
      previousSha256,
      nextSha256,
    };
  }
  if (previousSha256 === undefined) {
    return { path: desiredFile.path, status: "untracked", currentSha256, nextSha256 };
  }
  if (currentSha256 === previousSha256) {
    return { path: desiredFile.path, status: "update", currentSha256, previousSha256, nextSha256 };
  }
  return { path: desiredFile.path, status: "modified", currentSha256, previousSha256, nextSha256 };
};

export const inspectGeneratedAppUpgrade = async (
  options: InspectUpgradeOptions,
): Promise<GeneratedAppUpgradePlan> => {
  const manifest = await readManifest(options.targetDir);
  const nextCoreVersion = options.coreVersion ?? manifest.coreVersion;
  const desiredFiles = desiredFilesFor({
    applicationName: manifest.application.name,
    distributionMode: manifest.distributionMode,
    coreVersion: nextCoreVersion,
  });
  const previousFiles = new Map(manifest.managedFiles.map((file) => [file.path, file.sha256]));
  const desiredManagedFiles = desiredFiles.filter((file) => file.path !== GENERATED_MANIFEST_PATH);
  const reports = await Promise.all(
    desiredManagedFiles.map((file) =>
      reportFile({
        targetDir: options.targetDir,
        desiredFile: file,
        previousSha256: previousFiles.get(file.path),
        nextSha256: hashGeneratedFileContents(file.contents),
      }),
    ),
  );
  const desiredPaths = new Set(desiredManagedFiles.map((file) => file.path));
  const staleReports = manifest.managedFiles
    .filter((file) => !desiredPaths.has(file.path))
    .map((file) => ({
      path: file.path,
      status: "stale" as const,
      previousSha256: file.sha256,
    }));
  const files = [...reports, ...staleReports].toSorted((left, right) =>
    left.path.localeCompare(right.path),
  );
  const conflicts = files.filter(
    (file) => file.status === "modified" || file.status === "untracked",
  );
  const hasChanges =
    nextCoreVersion !== manifest.coreVersion || files.some((file) => file.status !== "unchanged");

  return {
    targetDir: options.targetDir,
    applicationName: manifest.application.name,
    distributionMode: manifest.distributionMode,
    currentCoreVersion: manifest.coreVersion,
    nextCoreVersion,
    files,
    conflicts,
    hasChanges,
  };
};

export const upgradeGeneratedApp = async (
  options: UpgradeAppOptions,
): Promise<GeneratedAppUpgradeResult> => {
  const plan = await inspectGeneratedAppUpgrade(options);
  if (options.dryRun === true || (plan.conflicts.length > 0 && options.force !== true)) {
    return { plan, applied: false };
  }

  const manifest = await readManifest(options.targetDir);
  const desiredFiles = desiredFilesFor({
    applicationName: manifest.application.name,
    distributionMode: manifest.distributionMode,
    coreVersion: plan.nextCoreVersion,
  });
  const reportByPath = new Map(plan.files.map((file) => [file.path, file]));
  await Promise.all(
    desiredFiles.map(async (file) => {
      const report = reportByPath.get(file.path);
      if (
        file.path !== GENERATED_MANIFEST_PATH &&
        report !== undefined &&
        report.status === "unchanged"
      )
        return;
      const fullPath = targetPath(options.targetDir, file.path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.contents);
    }),
  );
  return { plan, applied: true };
};
