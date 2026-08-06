import {
  buildExpectedSchema,
  diffSchemas,
  fetchProdSchema,
  pendingMigrations,
  productionDatabase,
  summarizeSchema,
} from "./prod-schema-lib.ts";

export const verifyProductionDrift = (database: string): string[] => {
  const problems: string[] = [];
  const pending = pendingMigrations(database);
  if (pending.length > 0) {
    problems.push(
      `Pending production D1 migrations must be applied first (pnpm --filter @emi/api db:migrate:prod): ${pending.join(", ")}`,
    );
  }
  const expected = summarizeSchema(buildExpectedSchema());
  const actual = summarizeSchema(fetchProdSchema(database));
  const differences = diffSchemas(expected, actual);
  if (differences.length > 0) {
    problems.push(
      `Production schema drift from the code-driven schema:\n${differences.map((difference) => `  - ${difference}`).join("\n")}`,
    );
  }
  return problems;
};

const main = () => {
  const database = productionDatabase();
  const problems = verifyProductionDrift(database);
  if (problems.length > 0) {
    console.error(problems.join("\n\n"));
    process.exit(1);
  }
  const actual = summarizeSchema(fetchProdSchema(database));
  console.log(
    `Production schema matches the code-driven schema (${Object.keys(actual.tables).length} tables, ${Object.keys(actual.indexes).length} indexes).`,
  );
};

await main();
