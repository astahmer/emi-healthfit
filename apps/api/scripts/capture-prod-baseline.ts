import { captureProdBaseline, productionDatabase } from "./prod-schema-lib.ts";
import { pathToFileURL } from "node:url";
import { verifyProductionDrift } from "./verify-prod-drift.ts";

const main = () => {
  const database = productionDatabase();
  const { pending, differences } = verifyProductionDrift(database);
  const force = process.argv.includes("--force");
  if (!force && (pending.length > 0 || differences.length > 0)) {
    throw new Error(
      "Refusing to capture the baseline while production has pending migrations or schema drift. " +
        "Fix production first, or pass --force to deliberately absorb the current state.",
    );
  }
  captureProdBaseline(database);
  console.log("Captured prod-schema-baseline.sql from the production database.");
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
