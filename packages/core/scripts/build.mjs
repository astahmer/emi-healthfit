import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = join(packageRoot, "package.json");
const distDirectory = join(packageRoot, "dist");

const readPackage = async () => JSON.parse(await readFile(packageJsonPath, "utf8"));

const sourcePathFor = (packageJson, entrypoint) => {
  const publicPath = packageJson.emi.publicApi.entrypointPaths[entrypoint];
  if (publicPath !== undefined) return publicPath;
  throw new Error(`No source path is registered for ${entrypoint}.`);
};

const outputPathFor = (sourcePath) => {
  const relativeSourcePath = sourcePath.replace(/^\.\/src\//, "");
  return relativeSourcePath.replace(/\.(?:tsx?|mts|cts)$/, ".js");
};

const run = (args) => {
  execFileSync("pnpm", args, { cwd: packageRoot, stdio: "inherit" });
};

const sourceEntries = (packageJson) =>
  Object.keys(packageJson.exports).map((entrypoint) => ({
    entrypoint,
    sourcePath: sourcePathFor(packageJson, entrypoint),
  }));

const buildJavaScript = (entries) => {
  for (const entry of entries) {
    if (entry.sourcePath.endsWith(".css")) continue;
    const outputPath = join(distDirectory, outputPathFor(entry.sourcePath));
    const externalSharedModules =
      entry.entrypoint === "./react"
        ? ["./react-hooks.ts"]
        : entry.entrypoint === "./components"
          ? ["../react-hooks.ts"]
          : entry.entrypoint === "./components/styled"
            ? ["../../react-hooks.ts"]
            : [];
    run([
      "exec",
      "esbuild",
      entry.sourcePath,
      "--bundle",
      "--format=esm",
      "--platform=neutral",
      "--packages=external",
      ...externalSharedModules.map((module) => `--external:${module}`),
      `--outfile=${outputPath}`,
      "--log-level=warning",
    ]);
  }
};

const buildSharedReactModule = () => {
  run([
    "exec",
    "esbuild",
    "src/react-hooks.ts",
    "--bundle",
    "--format=esm",
    "--platform=neutral",
    "--packages=external",
    `--outfile=${join(distDirectory, "react-hooks.js")}`,
    "--log-level=warning",
  ]);
};

const copyStyles = async (entries) => {
  for (const entry of entries) {
    if (!entry.sourcePath.endsWith(".css")) continue;
    const outputPath = join(distDirectory, outputPathFor(entry.sourcePath));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      await readFile(join(packageRoot, entry.sourcePath.replace(/^\.\//, ""))),
    );
  }
};

const rewriteDeclarationImports = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await rewriteDeclarationImports(path);
        return;
      }
      if (!entry.name.endsWith(".d.ts")) return;
      const source = await readFile(path, "utf8");
      const rewritten = source.replace(/(["'])(\.\.?\/[^"']+)\.(?:tsx?|mts|cts)(\1)/g, "$1$2.js$3");
      if (rewritten !== source) await writeFile(path, rewritten);
    }),
  );
};

const rewriteJavaScriptImports = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await rewriteJavaScriptImports(path);
        return;
      }
      if (!entry.name.endsWith(".js")) return;
      const source = await readFile(path, "utf8");
      const rewritten = source
        .replaceAll("../../react-hooks.ts", "./react-hooks.js")
        .replaceAll("../react-hooks.ts", "./react-hooks.js")
        .replaceAll("./react-hooks.ts", "./react-hooks.js");
      if (rewritten !== source) await writeFile(path, rewritten);
    }),
  );
};

const main = async () => {
  const packageJson = await readPackage();
  const entries = sourceEntries(packageJson);
  await rm(distDirectory, { recursive: true, force: true });
  await mkdir(distDirectory, { recursive: true });
  buildJavaScript(entries);
  buildSharedReactModule();
  await copyStyles(entries);
  await rewriteJavaScriptImports(distDirectory);
  run([
    "exec",
    "tsc",
    "-p",
    "tsconfig.build.json",
    "--declaration",
    "--emitDeclarationOnly",
    "--declarationMap",
    "false",
  ]);
  await rewriteDeclarationImports(join(distDirectory, "types"));
  await writeFile(
    join(distDirectory, "build-manifest.json"),
    `${JSON.stringify(
      {
        package: packageJson.name,
        version: packageJson.version,
        entrypoints: entries.map((entry) => ({
          name: entry.entrypoint,
          import: `./${outputPathFor(entry.sourcePath)}`,
        })),
      },
      null,
      2,
    )}\n`,
  );
};

await main();
