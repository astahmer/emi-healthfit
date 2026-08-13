import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreRoot = resolve(repositoryRoot, "packages/core");

const coreSourceAliases = () => {
  const corePackage = JSON.parse(
    readFileSync(resolve(coreRoot, "package.json"), "utf8"),
  );
  return Object.entries(corePackage.emi.publicApi.entrypointPaths).map(
    ([entrypoint, sourcePath]) => ({
      find: new RegExp(`^@emi/core${entrypoint === "." ? "" : entrypoint.slice(1)}$`),
      replacement: resolve(coreRoot, sourcePath),
    }),
  );
};

export { coreSourceAliases };
