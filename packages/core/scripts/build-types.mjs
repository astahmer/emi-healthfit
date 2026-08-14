import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const typesDirectory = join(packageRoot, "dist", "types");

const run = (args) => {
  execFileSync("pnpm", args, { cwd: packageRoot, stdio: "inherit" });
};

const main = async () => {
  run(["exec", "tsc", "-p", "tsconfig.build.json", "--declaration", "--emitDeclarationOnly"]);
  await rewriteDeclarationImports(typesDirectory);
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const entrypoints = Object.entries(packageJson.emi.publicApi.entrypointPaths)
    .filter(([, sourcePath]) => !sourcePath.endsWith(".css"))
    .map(([name, sourcePath]) => ({
      name,
      import: `./${sourcePath.replace(/^\.\/src\//, "").replace(/\.(?:tsx?|mts|cts)$/, ".js")}`,
    }));
  await writeFile(
    join(packageRoot, "dist", "build-manifest.json"),
    `${JSON.stringify(
      { package: packageJson.name, version: packageJson.version, entrypoints },
      null,
      2,
    )}\n`,
  );
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

await main();
