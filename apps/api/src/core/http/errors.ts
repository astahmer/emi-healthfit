import { BadRequest, InternalServerError, NotFound } from "@emi/core-migration/contract";
import * as Effect from "effect/Effect";

export const withInternalError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.mapError((error) => {
      if (
        error instanceof BadRequest ||
        error instanceof NotFound ||
        error instanceof InternalServerError
      )
        return error;
      return new InternalServerError({
        message: error instanceof Error ? error.message : String(error),
      });
    }),
  );
