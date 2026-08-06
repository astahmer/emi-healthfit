import { captureProdBaseline, productionDatabase } from "./prod-schema-lib.ts";

const main = () => {
  const database = productionDatabase();
  captureProdBaseline(database);
  console.log("Captured prod-schema-baseline.sql from the production database.");
};

await main();
