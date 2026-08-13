import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
    execFileSync(pnpm, ["exec", "--", "wrangler", ...args], {
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

const journalMigration = (database: string, name: string, applied: Set<string>): void => {
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
  console.log(`Journaled ${name} (${journalId}).`);
};

const main = () => {
  const database = productionDatabase();
  const pending = pendingMigrations(database);
  const applied = appliedMigrations(database);
  const recordIndex = process.argv.indexOf("--record");
  const recordNames = recordIndex === -1 ? [] : process.argv.slice(recordIndex + 1);
  if (recordNames.length > 0) {
    for (const name of recordNames) {
      if (!pending.includes(name)) {
        throw new Error(`Migration ${name} is not pending; refusing to record it.`);
      }
      journalMigration(database, name, applied);
    }
  } else {
    if (pending.length === 0) {
      console.log("Production D1 migrations are up to date.");
    }
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
      journalMigration(database, name, applied);
      console.log(`Applied ${name}.`);
    }
  }
  const { pending: remaining, differences } = verifyProductionDrift(database);
  if (differences.length > 0) {
    console.error(
      `Production schema drift after migrations:\n${differences
        .map((difference) => `  - ${difference}`)
        .join("\n")}`,
    );
    process.exit(1);
  }
  if (remaining.length > 0) {
    console.log(
      `Still pending (apply with db:migrate:prod or record with --record): ${remaining.join(", ")}`,
    );
  } else {
    console.log("Production schema verified against the code-driven schema.");
  }
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
