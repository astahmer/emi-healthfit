import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as Schema from "effect/Schema";

import { decodeJson } from "../src/platform/json-codec.ts";

import { appliedMigrations, pendingMigrations, productionDatabase } from "./prod-schema-lib.ts";
import { verifyProductionDrift } from "./verify-prod-drift.ts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const prodEnvFile = "../../.env.prod";

const ExecuteCommands = Schema.Array(
  Schema.Struct({
    results: Schema.optional(Schema.Array(Schema.Record(Schema.String, Schema.Unknown))),
  }),
);

const runWranglerJson = (args: string[]): Array<Record<string, unknown>> => {
  const output = decodeJson(
    execFileSync(pnpm, ["exec", "wrangler", ...args], {
      cwd: packageRoot,
      encoding: "utf8",
    }),
  );
  return Schema.decodeUnknownSync(ExecuteCommands)(output).flatMap(
    (command) => command.results ?? [],
  );
};

const nextJournalId = (database: string): string => {
  const result = runWranglerJson([
    "d1",
    "execute",
    database,
    "--remote",
    "--json",
    "--env-file",
    prodEnvFile,
    "--command",
    "SELECT MAX(id) AS max_id FROM d1_migrations",
  ]);
  const maxId = result.at(-1)?.max_id;
  return String(Number(String(maxId ?? 0)) + 1).padStart(5, "0");
};

const main = () => {
  const database = productionDatabase();
  const pending = pendingMigrations(database);
  if (pending.length === 0) {
    console.log("Production D1 migrations are up to date.");
  }
  const applied = appliedMigrations(database);
  for (const name of pending) {
    execFileSync(
      pnpm,
      [
        "exec",
        "wrangler",
        "d1",
        "execute",
        database,
        "--remote",
        "--json",
        "--env-file",
        prodEnvFile,
        "--file",
        resolve(packageRoot, "migrations", name),
      ],
      { cwd: packageRoot, stdio: "inherit" },
    );
    if (applied.has(name)) throw new Error(`Migration ${name} is already journaled in production.`);
    const journalId = nextJournalId(database);
    runWranglerJson([
      "d1",
      "execute",
      database,
      "--remote",
      "--json",
      "--env-file",
      prodEnvFile,
      "--command",
      `INSERT INTO d1_migrations (id, name, applied_at) VALUES ('${journalId}', '${name}', strftime('%Y-%m-%d %H:%M:%S','now'))`,
    ]);
    applied.add(name);
    console.log(`Applied and journaled ${name} (${journalId}).`);
  }
  const problems = verifyProductionDrift(database);
  if (problems.length > 0) {
    console.error(`Production schema drift after applying migrations:\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log("Production schema verified against the code-driven schema.");
};

await main();
