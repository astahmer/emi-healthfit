import * as Effect from "effect/Effect";

const valid = Effect.fn("valid")(function* ({ value }: { value: string }) {
  return yield* Effect.succeed(value);
});

void valid;
