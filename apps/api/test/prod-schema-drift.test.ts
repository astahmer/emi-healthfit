import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { diffSchemas, summarizeSchema, type SchemaSummary } from "../scripts/prod-schema-lib.ts";

const baseline = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../prod-schema-baseline.sql"),
  "utf8",
);

const tableStatements = (): Map<string, string> => {
  const tables = new Map<string, string>();
  let currentName: string | undefined;
  let current: string[] = [];
  for (const line of baseline.split("\n")) {
    if (/^CREATE\s+TABLE\s+/.test(line)) {
      current = [line];
      currentName = /^CREATE TABLE `?"?([A-Za-z_][A-Za-z0-9_]*)/.exec(line)?.[1];
    } else if (currentName !== undefined) {
      current.push(line);
    }
    if (currentName !== undefined && line.trim().endsWith(";")) {
      tables.set(currentName, current.join("\n"));
      currentName = undefined;
    }
  }
  return tables;
};

const indexStatements = (): Map<string, string> => {
  const indexes = new Map<string, string>();
  for (const line of baseline.split("\n")) {
    const match = /^CREATE (?:UNIQUE )?INDEX `?"?([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
    if (match !== null) indexes.set(match[1], line);
  }
  return indexes;
};

const schema = (rows: Array<Record<string, string>>): SchemaSummary => summarizeSchema(rows);

const tableRow = (name: string, sql: string): Record<string, string> => ({
  type: "table",
  name,
  tbl_name: name,
  sql,
});

describe("prod schema drift", () => {
  it("reports no differences for formatting variations of the same DDL", () => {
    const conversations = tableStatements().get("conversations");
    assert.ok(conversations !== undefined);
    const reformatted = conversations
      .replace(/[`"]/g, "")
      .replace(/\(/g, " (")
      .replace(/\)/g, " )");
    assert.deepEqual(
      diffSchemas(
        schema([tableRow("conversations", conversations)]),
        schema([tableRow("conversations", reformatted)]),
      ),
      [],
    );
  });

  it("reports missing columns against real production DDL", () => {
    const conversations = tableStatements().get("conversations");
    assert.ok(conversations !== undefined);
    const withoutUser = conversations.replace(/,\s*`user_id`\s*text\);\s*$/, ");");
    const differences = diffSchemas(
      schema([tableRow("conversations", conversations)]),
      schema([tableRow("conversations", withoutUser)]),
    );
    assert.ok(differences.some((difference) => difference.includes("user_id: missing column")));
  });

  it("reports extra columns and index definition changes", () => {
    const conversations = tableStatements().get("conversations");
    const userIndex = indexStatements().get("auth_session_user_id_idx");
    assert.ok(conversations !== undefined);
    assert.ok(userIndex !== undefined);
    const withExtraColumn = conversations.replace(/\);\s*$/, ", `deleted_at` text);");
    const mutatedIndex = userIndex.replace(/\(([^)]+)\)/, "($1, `extra_column`)");
    const differences = diffSchemas(
      schema([tableRow("conversations", conversations)]),
      schema([tableRow("conversations", withExtraColumn)]),
    );
    assert.ok(differences.some((difference) => difference.includes("deleted_at: extra column")));
    const indexDifferences = diffSchemas(
      schema([
        tableRow("conversations", conversations),
        {
          type: "index",
          name: "auth_session_user_id_idx",
          tbl_name: "auth_session",
          sql: userIndex,
        },
      ]),
      schema([
        tableRow("conversations", conversations),
        {
          type: "index",
          name: "auth_session_user_id_idx",
          tbl_name: "auth_session",
          sql: mutatedIndex,
        },
      ]),
    );
    assert.ok(
      indexDifferences.some((difference) =>
        difference.includes("index auth_session_user_id_idx: definition differs"),
      ),
    );
  });

  it("treats table-level primary keys as column primary keys", () => {
    const bodyMetrics = tableStatements().get("body_metrics");
    assert.ok(bodyMetrics !== undefined);
    const columns = schema([tableRow("body_metrics", bodyMetrics)]).tables.body_metrics?.columns;
    assert.deepEqual(
      columns?.slice(0, 2).map((column) => column.primaryKey),
      [true, true],
    );
    assert.deepEqual(
      columns?.slice(2).map((column) => column.primaryKey),
      [false, false, false, false],
    );
  });
});
