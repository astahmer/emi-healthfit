import * as Effect from "effect/Effect";

export const program = Effect.succeed("ok").pipe(
  Effect.catchIf(
    (cause) => cause instanceof Error,
    () => Effect.succeed("recovered"),
  ),
);
