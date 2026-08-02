import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const packageRoot = resolve(new URL("..", import.meta.url).pathname);

const filesUnder = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else files.push(relative(packageRoot, path).replaceAll("\\", "/"));
  }
  return files.toSorted();
};

const main = async () => {
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const publicApi = packageJson.emi.publicApi;
  const entrypoints = Object.entries(publicApi.entrypointPaths).map(([name, source]) => ({
    name,
    source,
    dependencyTier: publicApi.entrypoints[name],
  }));
  const manifest = {
    manifestVersion: 1,
    package: packageJson.name,
    packageVersion: packageJson.version,
    catalogVersion: publicApi.version,
    provenance: `@emi/core source catalog ${publicApi.version}`,
    generatedBy: "packages/core/scripts/source-manifest.mjs",
    entrypoints: entrypoints.toSorted((left, right) => left.name.localeCompare(right.name)),
    sourceFiles: await filesUnder(join(packageRoot, "src")),
    testFiles: await filesUnder(join(packageRoot, "test")),
  };
  await writeFile(
    join(packageRoot, "source-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
};

await main();
