import { mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const apiDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const coreDirectory = join(apiDirectory, "../../packages/core");
const migrationsDirectory = join(apiDirectory, "migrations");
const ignoredMigrationFiles = new Set(["20260802113108_add-auth-tables.sql"]);

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

const createMigrationView = async () => {
  const viewDirectory = await mkdtemp(join(tmpdir(), "emi-api-alchemy-migrations-"));
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() && entry.name.endsWith(".sql") && !ignoredMigrationFiles.has(entry.name),
      )
      .map((entry) =>
        symlink(join(migrationsDirectory, entry.name), join(viewDirectory, entry.name)),
      ),
  );
  return viewDirectory;
};

const run = async () => {
  if (process.env.EMI_SKIP_CORE_BUILD !== "1") await buildCore();
  const viewDirectory = await createMigrationView();
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
    env: { ...process.env, EMI_ALCHEMY_MIGRATIONS_DIR: viewDirectory },
    stdio: "inherit",
  });
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  await rm(viewDirectory, { force: true, recursive: true });
  process.exitCode = result.code ?? (result.signal === null ? 1 : 0);
};

await run();
