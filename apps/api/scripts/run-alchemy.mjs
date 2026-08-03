import { mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const apiDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsDirectory = join(apiDirectory, "migrations");
const ignoredMigrationFiles = new Set(["20260802113108_add-auth-tables.sql"]);

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
  const viewDirectory = await createMigrationView();
  const child = spawn("pnpm", ["exec", "alchemy", ...process.argv.slice(2)], {
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
