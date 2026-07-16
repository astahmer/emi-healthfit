import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

export type QueryDatabaseClient = Effect.Success<ReturnType<typeof Cloudflare.D1.QueryDatabase>>;

const BATCH_SIZE = 100;

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

export const runBatches = (
  db: QueryDatabaseClient,
  statements: ReturnType<QueryDatabaseClient["prepare"]>[],
) =>
  Effect.gen(function* () {
    for (const batch of chunk(statements, BATCH_SIZE)) {
      yield* db.batch(batch);
    }
  });
