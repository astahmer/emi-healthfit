import * as Effect from "effect/Effect";
import type { DiscordHttpResponse } from "@emi/core/discord";
import {
  badRequestResponse,
  DiscordInteractionType,
  pongResponse,
  unauthorizedResponse,
  verifyDiscordRequest,
} from "@emi/core/discord";
import { dispatchApplicationCommand } from "../commands/dispatch.ts";
import type { HealthfitCommandServices } from "../commands/limits.ts";

export interface HandleInteractionsRequestInput {
  readonly rawBody: string;
  readonly signature: string | null | undefined;
  readonly timestamp: string | null | undefined;
  readonly publicKeyHex: string;
  readonly services: HealthfitCommandServices;
}

/**
 * Discord requires `401` for an invalid or replayed request before any parsing/dispatch happens.
 * `verifyDiscordRequest` enforces that ordering; every failure tag maps to a fixed HTTP response
 * here so the body is never inspected ahead of a successful signature check.
 */
export const handleInteractionsRequest = Effect.fn("discord-bot.handleInteractions")(function* (
  input: HandleInteractionsRequestInput,
) {
  return yield* verifyDiscordRequest(input).pipe(
    Effect.flatMap((interaction): Effect.Effect<DiscordHttpResponse> => {
      if (interaction.type === DiscordInteractionType.Ping) return Effect.succeed(pongResponse());
      return dispatchApplicationCommand(interaction, input.services);
    }),
    Effect.catchTags({
      MissingSignatureHeaders: () =>
        Effect.succeed(unauthorizedResponse("missing signature headers")),
      InvalidSignature: () => Effect.succeed(unauthorizedResponse("invalid request signature")),
      StaleTimestamp: () => Effect.succeed(unauthorizedResponse("stale request timestamp")),
      MalformedInteraction: (error) => Effect.succeed(badRequestResponse(error.message)),
    }),
  );
});
