import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

export interface GuardrailViolation {
  file: string;
  reason: string;
}

const CORE_SOURCE_ROOTS = [
  "packages/core/src/contract",
  "packages/core/src/server",
  "packages/core/src/web",
  "packages/core/src/cloudflare",
  "packages/core/src/discord",
];

const FORBIDDEN_IMPORT_PATTERNS: RegExp[] = [
  /from\s+["'][^"']*core\/src\//,
  /from\s+["'][^"']*\.\.\/\.\.\/packages\//,
  /from\s+["'][^"']*\bapps\/(api|chat)\//,
];

const walkFiles = async (directory: string): Promise<string[]> => {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.name !== "node_modules")
      .map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? walkFiles(path) : Promise.resolve([path]);
      }),
  );
  return nested.flat();
};

const hashContents = (contents: Buffer): string =>
  createHash("sha256").update(contents).digest("hex");

/**
 * Hashes every file under the core packages' `src/` directories so the
 * generated tree can be checked for literal copy-paste, not just import
 * strings (a rename would still be caught by content-hash equality).
 */
export const buildCoreSourceHashIndex = async (repoRoot: string): Promise<Set<string>> => {
  const fileLists = await Promise.all(
    CORE_SOURCE_ROOTS.map((root) => walkFiles(join(repoRoot, root))),
  );
  const hashes = await Promise.all(
    fileLists.flat().map(async (file) => hashContents(await readFile(file))),
  );
  return new Set(hashes);
};

export const scanGeneratedTreeForCopiedCoreSource = async (options: {
  generatedRoot: string;
  coreSourceHashes: Set<string>;
  ownedCore?: boolean;
}): Promise<GuardrailViolation[]> => {
  const files = await walkFiles(options.generatedRoot);
  const violationLists = await Promise.all(
    files.map(async (file) => {
      const relPath = relative(options.generatedRoot, file);
      if (
        options.ownedCore === true &&
        relPath.startsWith("core/")
      )
        return [];
      const contents = await readFile(file);
      const violations: GuardrailViolation[] = [];
      if (options.coreSourceHashes.has(hashContents(contents))) {
        violations.push({
          file: relPath,
          reason: "content hash matches a core package source file",
        });
      }
      const text = contents.toString("utf8");
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        if (pattern.test(text))
          violations.push({ file: relPath, reason: `forbidden import pattern: ${pattern}` });
      }
      return violations;
    }),
  );
  return violationLists.flat();
};
