import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const platformPackages = {
  darwin: {
    arm64: "@ast-grep/cli-darwin-arm64",
    x64: "@ast-grep/cli-darwin-x64",
  },
  linux: {
    arm64: "@ast-grep/cli-linux-arm64-gnu",
    x64: "@ast-grep/cli-linux-x64-gnu",
  },
  win32: {
    arm64: "@ast-grep/cli-win32-arm64-msvc",
    ia32: "@ast-grep/cli-win32-ia32-msvc",
    x64: "@ast-grep/cli-win32-x64-msvc",
  },
};

const packageName = platformPackages[process.platform]?.[process.arch];
if (packageName === undefined) {
  throw new Error(`Unsupported ast-grep platform: ${process.platform}/${process.arch}`);
}

const require = createRequire(import.meta.url);
const cliDirectory = dirname(require.resolve("@ast-grep/cli/package.json"));
const packageDirectory = dirname(
  require.resolve(`${packageName}/package.json`, { paths: [cliDirectory] }),
);
const binaryName = process.platform === "win32" ? "ast-grep.exe" : "ast-grep";
const result = spawnSync(join(packageDirectory, binaryName), process.argv.slice(2), {
  stdio: "inherit",
});

if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
