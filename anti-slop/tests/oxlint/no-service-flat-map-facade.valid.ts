import * as Effect from "effect/Effect";

export const program = Effect.gen(function* () {
  const database = { query: Effect.succeed("ok") };
  return yield* database.query;
});
