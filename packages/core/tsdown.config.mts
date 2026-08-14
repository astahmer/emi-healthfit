import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "tsdown";

const packageRoot = resolve(import.meta.dirname);
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
  emi: {
    publicApi: { entrypointPaths: Record<string, string> };
  };
};

const outputNameFor = (sourcePath: string) =>
  sourcePath.replace(/^\.\/src\//, "").replace(/\.(?:tsx?|mts|cts)$/, "");

const sourcePaths = Object.values(packageJson.emi.publicApi.entrypointPaths).filter(
  (sourcePath) => !sourcePath.endsWith(".css"),
);

const entries = Object.fromEntries(
  sourcePaths.map((sourcePath) => [outputNameFor(sourcePath), sourcePath]),
) as Record<string, string>;
entries["react-hooks"] = "./src/react-hooks.ts";

export default defineConfig({
  entry: entries,
  format: ["esm"],
  platform: "neutral",
  clean: true,
  sourcemap: false,
  dts: false,
  deps: {
    neverBundle: true,
  },
  copy: [{ from: "src/styles/styles.css", to: "dist/styles" }],
  report: false,
});
