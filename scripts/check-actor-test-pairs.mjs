import { readdir } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const filesUnder = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["node_modules", "dist", ".git", "coverage"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesUnder(path)));
      continue;
    }
    files.push(path);
  }
  return files;
};

const sourceFiles = (await filesUnder(join(repositoryRoot, "packages/core/src"))).filter(
  (path) => /(?:actor|machine)\.ts$/.test(path),
);
const testNames = new Set(
  (await filesUnder(join(repositoryRoot, "packages/core/test")))
    .filter((path) => /\.test\.tsx?$/.test(path))
    .map((path) => basename(path).replace(/\.test\.tsx?$/, "")),
);
const missingTests = sourceFiles
  .map((path) => ({ path, name: basename(path, extname(path)) }))
  .filter(({ name }) => !testNames.has(name));

if (missingTests.length > 0) {
  console.error("Actor test pairing check failed:");
  for (const { path, name } of missingTests) {
    console.error(`- ${relative(repositoryRoot, path)} needs packages/core/test/**/${name}.test.ts[x]`);
  }
  process.exitCode = 1;
} else {
  console.log(`Actor test pairing check passed for ${sourceFiles.length} actor/machine modules.`);
}
