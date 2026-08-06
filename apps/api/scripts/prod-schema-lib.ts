import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import * as Schema from "effect/Schema";

import { decodeJson } from "../src/platform/json-codec.ts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const prodEnvFile = "../../.env.prod";
const baselineFilePath = resolve(packageRoot, "prod-schema-baseline.sql");
const baselineHeader = "-- baseline: ";

const schemaQuery =
  "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name != 'd1_migrations' ORDER BY type, name";

const Databases = Schema.Array(Schema.Struct({ name: Schema.String }));
const ExecuteCommands = Schema.Array(
  Schema.Struct({
    results: Schema.optional(Schema.Array(Schema.Record(Schema.String, Schema.Unknown))),
  }),
);
const Journal = Schema.Struct({ entries: Schema.Array(Schema.Struct({ tag: Schema.String })) });

const runWrangler = (args: string[]): unknown =>
  decodeJson(
    execFileSync(pnpm, ["exec", "wrangler", ...args], {
      cwd: packageRoot,
      encoding: "utf8",
    }),
  );

const resultRows = (result: unknown): Array<Record<string, unknown>> =>
  Schema.decodeUnknownSync(ExecuteCommands)(result).flatMap((command) => command.results ?? []);

export const productionDatabase = (): string => {
  const databases = Schema.decodeUnknownSync(Databases)(
    runWrangler(["d1", "list", "--json", "--env-file", prodEnvFile]),
  );
  const database = databases.find((candidate) =>
    candidate.name.startsWith("emi-healthfit-GymData-prod-"),
  );
  if (database === undefined) throw new Error("Could not find the production GymData database.");
  return database.name;
};

export const journalMigrations = (): string[] => {
  const journal = Schema.decodeUnknownSync(Journal)(
    decodeJson(readFileSync(resolve(packageRoot, "migrations/meta/_journal.json"), "utf8")),
  );
  return journal.entries.map((entry) => `${entry.tag}.sql`);
};

export const appliedMigrations = (database: string): Set<string> =>
  new Set(
    resultRows(
      runWrangler([
        "d1",
        "execute",
        database,
        "--remote",
        "--json",
        "--env-file",
        prodEnvFile,
        "--command",
        "SELECT name FROM d1_migrations ORDER BY id",
      ]),
    ).map((row) => String(row.name)),
  );

export const pendingMigrations = (database: string): string[] => {
  const generated = journalMigrations();
  const applied = appliedMigrations(database);
  const latestApplied = generated.findLast((name) => applied.has(name));
  return generated.filter(
    (name) => (latestApplied === undefined || name > latestApplied) && !applied.has(name),
  );
};

export const fetchProdSchema = (database: string): Array<Record<string, string>> =>
  resultRows(
    runWrangler([
      "d1",
      "execute",
      database,
      "--remote",
      "--json",
      "--env-file",
      prodEnvFile,
      "--command",
      schemaQuery,
    ]),
  )
    .filter((row) => typeof row.sql === "string" && !String(row.name).startsWith("_cf_"))
    .map((row) => ({
      type: String(row.type),
      name: String(row.name),
      tbl_name: String(row.tbl_name),
      sql: String(row.sql),
    }));

const baselinePosition = (): string => {
  const header = readFileSync(baselineFilePath, "utf8")
    .split("\n")
    .find((line) => line.startsWith(baselineHeader));
  if (header === undefined) {
    throw new Error(
      "Missing prod schema baseline. Capture it once with pnpm --filter @emi/api db:baseline:prod.",
    );
  }
  return header.slice(baselineHeader.length).trim();
};

const replayStatements = (database: DatabaseSync, sql: string, errors: string[]): void => {
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim() === "") continue;
    try {
      database.exec(statement);
    } catch (cause) {
      errors.push(
        `${statement.trim().slice(0, 80)}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }
};

export const buildExpectedSchema = (): {
  rows: Array<Record<string, string>>;
  replayErrors: string[];
} => {
  const directory = mkdtempSync(join(tmpdir(), "emi-prod-schema-"));
  const databasePath = join(directory, "expected.db");
  try {
    const database = new DatabaseSync(databasePath);
    try {
      const replayErrors: string[] = [];
      replayStatements(database, readFileSync(baselineFilePath, "utf8"), replayErrors);
      const position = baselinePosition();
      for (const name of journalMigrations()) {
        if (name <= `${position}.sql`) continue;
        replayStatements(
          database,
          readFileSync(resolve(packageRoot, "migrations", name), "utf8"),
          replayErrors,
        );
      }
      return {
        rows: database.prepare(schemaQuery).all() as Array<Record<string, string>>,
        replayErrors,
      };
    } finally {
      database.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

export const captureProdBaseline = (database: string): void => {
  const pending = pendingMigrations(database);
  if (pending.length > 0) {
    throw new Error(
      `Apply all production D1 migrations before capturing the baseline: ${pending.join(", ")}`,
    );
  }
  const rows = fetchProdSchema(database).toSorted((left, right) => {
    const order = { table: 0, index: 1, trigger: 2 } as const;
    const typeOrder = (type: string): number =>
      type in order ? order[type as keyof typeof order] : 3;
    return typeOrder(left.type) - typeOrder(right.type) || left.name.localeCompare(right.name);
  });
  const journal = journalMigrations();
  const position = journal.at(-1)?.replace(/\.sql$/, "");
  if (position === undefined) throw new Error("The migration journal is empty.");
  const statements = rows
    .map((row) => (row.sql.endsWith(";") ? row.sql : `${row.sql};`))
    .join("\n");
  writeFileSync(
    baselineFilePath,
    `${baselineHeader}${position}\n-- Captured from the production database; schema changes must go through Drizzle migrations.\n\n${statements}\n`,
  );
};

const normalizeSql = (sql: string): string =>
  sql
    .replace(/[`"]/g, "")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/;\s*$/, "")
    .toLowerCase();

const splitTopLevel = (body: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of body) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim() !== "") parts.push(current.trim());
  return parts;
};

type ColumnSummary = {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
};

const tableColumns = (sql: string): ColumnSummary[] => {
  const body = sql.slice(sql.indexOf("(") + 1, sql.lastIndexOf(")"));
  const parts = splitTopLevel(body);
  const columns: ColumnSummary[] = [];
  const tablePrimaryKeys = new Set<string>();
  for (const part of parts) {
    const primaryKeyMatch =
      /^primary\s+key\s*\(([^)]*)\)$/i.exec(part) ??
      /^constraint\s+\S+\s+primary\s+key\s*\(([^)]*)\)$/i.exec(part);
    if (primaryKeyMatch !== null) {
      for (const name of primaryKeyMatch[1].split(",")) {
        tablePrimaryKeys.add(name.trim().replace(/[`"]/g, "").toLowerCase());
      }
    }
  }
  for (const part of parts) {
    if (/^(primary\s+key|foreign\s+key|unique|check|constraint)\b/i.test(part)) {
      continue;
    }
    const columnMatch =
      /^`?([A-Za-z_][A-Za-z0-9_]*)`?\s+([A-Za-z_][A-Za-z0-9_]*)(?:\([^)]*\))?\s*(.*)$/i.exec(part);
    if (columnMatch === null) continue;
    const name = columnMatch[1].toLowerCase();
    const constraints = columnMatch[3] ?? "";
    columns.push({
      name,
      type: columnMatch[2].toLowerCase(),
      notNull: /\bnot\s+null\b/i.test(constraints),
      primaryKey: /\bprimary\s+key\b/i.test(constraints) || tablePrimaryKeys.has(name),
    });
  }
  return columns;
};

const foreignKeyCount = (sql: string): number => {
  const body = sql.slice(sql.indexOf("(") + 1, sql.lastIndexOf(")"));
  return splitTopLevel(body).filter((part) => /^foreign\s+key\b/i.test(part)).length;
};

export type SchemaSummary = {
  tables: Record<
    string,
    {
      columns: ColumnSummary[];
      foreignKeys: number;
      sql: string;
    }
  >;
  indexes: Record<string, string>;
  triggers: Record<string, string>;
};

export const summarizeSchema = (rows: Array<Record<string, string>>): SchemaSummary => {
  const tables: SchemaSummary["tables"] = {};
  const indexes: SchemaSummary["indexes"] = {};
  const triggers: SchemaSummary["triggers"] = {};
  for (const row of rows) {
    if (row.sql === undefined) continue;
    if (row.type === "table") {
      tables[row.name] = {
        columns: tableColumns(row.sql),
        foreignKeys: foreignKeyCount(row.sql),
        sql: normalizeSql(row.sql),
      };
    } else if (row.type === "index") {
      indexes[row.name] = normalizeSql(row.sql);
    } else if (row.type === "trigger") {
      triggers[row.name] = normalizeSql(row.sql);
    }
  }
  return { tables, indexes, triggers };
};

const columnSignature = (column: ColumnSummary): string =>
  `${column.name}:${column.type}:${column.notNull ? "notNull" : "nullable"}:${
    column.primaryKey ? "pk" : "nonPk"
  }`;

export const diffSchemas = (expected: SchemaSummary, actual: SchemaSummary): string[] => {
  const differences: string[] = [];
  for (const name of Object.keys(expected.tables)) {
    if (!(name in actual.tables)) differences.push(`missing table ${name}`);
  }
  for (const name of Object.keys(actual.tables)) {
    if (!(name in expected.tables)) differences.push(`extra table ${name}`);
  }
  for (const name of Object.keys(expected.tables)) {
    const expectedTable = expected.tables[name];
    const actualTable = actual.tables[name];
    if (actualTable === undefined) continue;
    if (expectedTable.sql === actualTable.sql) continue;
    const expectedColumns = new Map(expectedTable.columns.map((column) => [column.name, column]));
    const actualColumns = new Map(actualTable.columns.map((column) => [column.name, column]));
    let reportedColumnDifference = false;
    for (const column of expectedTable.columns) {
      const match = actualColumns.get(column.name);
      if (match === undefined) {
        reportedColumnDifference = true;
        differences.push(`${name}.${column.name}: missing column`);
      } else if (columnSignature(column) !== columnSignature(match)) {
        reportedColumnDifference = true;
        differences.push(
          `${name}.${column.name}: column mismatch (expected ${columnSignature(column)}, got ${columnSignature(match)})`,
        );
      }
    }
    for (const column of actualTable.columns) {
      if (!expectedColumns.has(column.name)) {
        reportedColumnDifference = true;
        differences.push(`${name}.${column.name}: extra column`);
      }
    }
    if (expectedTable.foreignKeys !== actualTable.foreignKeys) {
      reportedColumnDifference = true;
      differences.push(
        `${name}: foreign key count differs (expected ${expectedTable.foreignKeys}, got ${actualTable.foreignKeys})`,
      );
    }
    if (!reportedColumnDifference) differences.push(`table ${name}: definition differs`);
  }
  for (const name of Object.keys(expected.indexes)) {
    if (!(name in actual.indexes)) differences.push(`missing index ${name}`);
  }
  for (const name of Object.keys(actual.indexes)) {
    if (!(name in expected.indexes)) differences.push(`extra index ${name}`);
  }
  for (const name of Object.keys(expected.indexes)) {
    const expectedIndex = expected.indexes[name];
    const actualIndex = actual.indexes[name];
    if (actualIndex !== undefined && expectedIndex !== actualIndex) {
      differences.push(`index ${name}: definition differs`);
    }
  }
  for (const name of Object.keys(expected.triggers)) {
    if (!(name in actual.triggers)) differences.push(`missing trigger ${name}`);
  }
  for (const name of Object.keys(actual.triggers)) {
    if (!(name in expected.triggers)) differences.push(`extra trigger ${name}`);
  }
  for (const name of Object.keys(expected.triggers)) {
    const expectedTrigger = expected.triggers[name];
    const actualTrigger = actual.triggers[name];
    if (actualTrigger !== undefined && expectedTrigger !== actualTrigger) {
      differences.push(`trigger ${name}: definition differs`);
    }
  }
  return differences;
};
