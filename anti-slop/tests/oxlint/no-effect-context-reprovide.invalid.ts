import * as Effect from "effect/Effect";

export const program = Effect.gen(function* () {
  const context = yield* Effect.context();
  return yield* Effect.provideContext(Effect.succeed("ok"), context);
});
