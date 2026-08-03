import * as Effect from "effect/Effect";
import { MemoryDatabase } from "../../packages/core/src/server/db/memories.ts";

void MemoryDatabase;

const invalid = Effect.fn("invalid")(function* ({
  reader,
  value,
}: {
  reader: unknown;
  value: string;
}) {
  yield* Effect.succeed(reader);
  return value;
});

const invalidDatabase = Effect.fn("invalidDatabase")(function* ({
  database,
}: {
  database: unknown;
}) {
  yield* Effect.succeed(database);
});

void invalid;
void invalidDatabase;
