import {
  buildExpectedSchema,
  diffSchemas,
  fetchProdSchema,
  pendingMigrations,
  productionDatabase,
  summarizeSchema,
} from "./prod-schema-lib.ts";
import { pathToFileURL } from "node:url";

export const verifyProductionDrift = (
  database: string,
): {
  pending: string[];
  differences: string[];
  replayErrors: string[];
} => {
  const pending = pendingMigrations(database);
  const expectedState = buildExpectedSchema();
  const expected = summarizeSchema(expectedState.rows);
  const actual = summarizeSchema(fetchProdSchema(database));
  return {
    pending,
    differences: diffSchemas(expected, actual),
    replayErrors: expectedState.replayErrors,
  };
};

const main = () => {
  const database = productionDatabase();
  const { pending, differences, replayErrors } = verifyProductionDrift(database);
  const problems: string[] = [];
  if (pending.length > 0) {
    problems.push(
      differences.length === 0
        ? `Production schema already matches these pending migrations — record them as applied with pnpm --filter @emi/api db:migrate:prod --record <name>: ${pending.join(", ")}`
        : `Pending production D1 migrations must be applied first (pnpm --filter @emi/api db:migrate:prod): ${pending.join(", ")}`,
    );
  }
  if (differences.length > 0) {
    problems.push(
      `Production schema drift from the code-driven schema:\n${differences
        .map((difference) => `  - ${difference}`)
        .join("\n")}`,
    );
    if (replayErrors.length > 0) {
      problems.push(
        `${replayErrors.length} migration statement(s) could not be replayed locally (likely already applied):\n${replayErrors
          .map((error) => `  - ${error}`)
          .join("\n")}`,
      );
    }
  }
  if (problems.length > 0) {
    console.error(problems.join("\n\n"));
    process.exit(1);
  }
  const actual = summarizeSchema(fetchProdSchema(database));
  console.log(
    `Production schema matches the code-driven schema (${Object.keys(actual.tables).length} tables, ${Object.keys(actual.indexes).length} indexes).`,
  );
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
