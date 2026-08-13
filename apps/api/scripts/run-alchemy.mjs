import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const coreDirectory = join(apiDirectory, "../../packages/core");
const migrationsDirectory = join(apiDirectory, "migrations");

const buildCore = async () => {
  const child = spawn("pnpm", ["build"], {
    cwd: coreDirectory,
    stdio: "inherit",
  });
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  if (result.code === 0) return;
  throw new Error(`@emi/core build failed (${result.code ?? result.signal ?? "unknown"}).`);
};

const run = async () => {
  if (process.env.EMI_SKIP_CORE_BUILD !== "1") await buildCore();
  const argumentsToForward = process.argv.slice(2).filter((argument) => argument !== "--");
  const alchemyArguments =
    argumentsToForward[0] === "login" &&
    !argumentsToForward.includes("--configure") &&
    !argumentsToForward.includes("--help") &&
    !argumentsToForward.includes("-h")
      ? ["login", "--configure", ...argumentsToForward.slice(1)]
      : argumentsToForward;
  const child = spawn("pnpm", ["exec", "alchemy", ...alchemyArguments], {
    cwd: apiDirectory,
    env: { ...process.env, EMI_ALCHEMY_MIGRATIONS_DIR: migrationsDirectory },
    stdio: "inherit",
  });
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  process.exitCode = result.code ?? (result.signal === null ? 1 : 0);
};

await run();
