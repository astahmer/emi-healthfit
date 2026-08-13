import { BadRequest, InternalServerError, NotFound } from "@emi/core/contract";
import { Chat } from "@emi/core/chat";
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
        message: Chat.errors.readableErrorMessage(error, "Internal server error."),
      });
    }),
  );
