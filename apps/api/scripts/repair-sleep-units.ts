import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as Schema from "effect/Schema";

import { decodeJson } from "../src/platform/json-codec.ts";
import { productionDatabase } from "./prod-schema-lib.ts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const prodEnvFile = "../../.env.prod";

const ExecuteCommands = Schema.Array(
  Schema.Struct({
    results: Schema.optional(Schema.Array(Schema.Record(Schema.String, Schema.Unknown))),
  }),
);

const RepairOptions = Schema.Struct({
  userId: Schema.String.check(Schema.isMinLength(1)),
  confirmUserId: Schema.String.check(Schema.isMinLength(1)),
  backupPath: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
  apply: Schema.optional(Schema.Boolean),
});

type QueryRow = Record<string, unknown>;

const runWranglerJson = (args: string[]): QueryRow[] => {
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

const escapeSql = (value: string): string => value.replaceAll("'", "''");

const query = ({ database, sql }: { database: string; sql: string }): QueryRow[] =>
  runWranglerJson([
    "d1",
    "execute",
    database,
    "--remote",
    "--json",
    "--env-file",
    prodEnvFile,
    "--command",
    sql,
  ]);

const parseArguments = (arguments_: string[]) => {
  const values: Record<string, string | boolean> = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--") continue;
    if (argument === "--apply") {
      values.apply = true;
      continue;
    }
    if (argument === "--user-id") values.userId = arguments_[index + 1] ?? "";
    if (argument === "--confirm-user-id") values.confirmUserId = arguments_[index + 1] ?? "";
    if (argument === "--backup-path") values.backupPath = arguments_[index + 1] ?? "";
    if (
      argument === "--user-id" ||
      argument === "--confirm-user-id" ||
      argument === "--backup-path"
    ) {
      index += 1;
      continue;
    }
    if (argument !== "--apply") throw new Error(`Unknown argument: ${argument}`);
  }

  const options = Schema.decodeUnknownSync(RepairOptions)(values);
  if (options.userId !== options.confirmUserId) {
    throw new Error("--confirm-user-id must exactly match --user-id.");
  }
  if (options.apply && options.backupPath === undefined) {
    throw new Error("--backup-path is required with --apply.");
  }
  return { ...options, apply: options.apply ?? false };
};

const numericValue = (row: QueryRow, key: string): number => Number(row[key] ?? 0);

const main = () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.apply && options.backupPath !== undefined) {
    if (!existsSync(options.backupPath) || statSync(options.backupPath).size === 0) {
      throw new Error(`Backup file is missing or empty: ${options.backupPath}`);
    }
  }

  const database = productionDatabase();
  const userId = escapeSql(options.userId);
  const before = query({
    database,
    sql: `SELECT COUNT(*) AS rows, SUM(CASE WHEN in_bed_min > 1440 OR asleep_min > 1440 OR awake_min > 1440 THEN 1 ELSE 0 END) AS over_day, MAX(in_bed_min) AS max_in_bed, MAX(asleep_min) AS max_asleep, MAX(awake_min) AS max_awake FROM sleep_sessions WHERE user_id = '${userId}'`,
  })[0];
  if (before === undefined || numericValue(before, "rows") === 0) {
    throw new Error("No sleep rows found for requested user.");
  }
  if (numericValue(before, "over_day") === 0) {
    throw new Error("No clearly corrupt sleep rows found; refusing to divide durations again.");
  }

  console.log(
    JSON.stringify({
      database,
      userId: options.userId,
      rows: numericValue(before, "rows"),
      overDayBefore: numericValue(before, "over_day"),
      maxBefore: {
        inBed: numericValue(before, "max_in_bed"),
        asleep: numericValue(before, "max_asleep"),
        awake: numericValue(before, "max_awake"),
      },
      apply: options.apply,
      backupPath: options.backupPath ?? null,
    }),
  );
  if (!options.apply) return;

  query({
    database,
    sql: `UPDATE sleep_sessions SET in_bed_min = CASE WHEN in_bed_min IS NULL THEN NULL ELSE CAST(ROUND(in_bed_min / 60.0) AS INTEGER) END, asleep_min = CASE WHEN asleep_min IS NULL THEN NULL ELSE CAST(ROUND(asleep_min / 60.0) AS INTEGER) END, awake_min = CASE WHEN awake_min IS NULL THEN NULL ELSE CAST(ROUND(awake_min / 60.0) AS INTEGER) END WHERE user_id = '${userId}'`,
  });

  const after = query({
    database,
    sql: `SELECT COUNT(*) AS rows, SUM(CASE WHEN in_bed_min > 1440 OR asleep_min > 1440 OR awake_min > 1440 THEN 1 ELSE 0 END) AS over_day, SUM(CASE WHEN in_bed_min < 0 OR asleep_min < 0 OR awake_min < 0 THEN 1 ELSE 0 END) AS negative, MAX(in_bed_min) AS max_in_bed, MAX(asleep_min) AS max_asleep, MAX(awake_min) AS max_awake FROM sleep_sessions WHERE user_id = '${userId}'`,
  })[0];
  if (after === undefined) throw new Error("Repair verification returned no row.");
  if (numericValue(after, "rows") !== numericValue(before, "rows")) {
    throw new Error("Repair changed sleep row count.");
  }
  if (numericValue(after, "over_day") !== 0 || numericValue(after, "negative") !== 0) {
    throw new Error("Repair verification found invalid sleep durations.");
  }

  console.log(
    JSON.stringify({
      repaired: true,
      rows: numericValue(after, "rows"),
      overDayAfter: numericValue(after, "over_day"),
      maxAfter: {
        inBed: numericValue(after, "max_in_bed"),
        asleep: numericValue(after, "max_asleep"),
        awake: numericValue(after, "max_awake"),
      },
    }),
  );
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
