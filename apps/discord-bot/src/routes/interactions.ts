import * as Effect from "effect/Effect";
import type { DiscordHttpResponse } from "@emi/core-migration/discord";
import {
  badRequestResponse,
  DiscordInteractionType,
  pongResponse,
  unauthorizedResponse,
  verifyDiscordRequest,
} from "@emi/core-migration/discord";
import { dispatchApplicationCommand } from "../commands/dispatch.ts";
import type { HealthfitCommandServices } from "../commands/limits.ts";

export interface HandleInteractionsRequestInput {
  readonly rawBody: string;
  readonly signature: string | null | undefined;
  readonly timestamp: string | null | undefined;
  readonly publicKeyHex: string;
  readonly services: HealthfitCommandServices;
  readonly applicationId: string;
  readonly botToken: string;
  readonly apiBaseUrl: string;
  readonly internalSecret: string;
  readonly waitUntil: (promise: Promise<unknown>) => void;
}

export const handleInteractionsRequest = Effect.fn("discord-bot.handleInteractions")(function* (
  input: HandleInteractionsRequestInput,
) {
  return yield* verifyDiscordRequest(input).pipe(
    Effect.flatMap((interaction): Effect.Effect<DiscordHttpResponse> => {
      if (interaction.type === DiscordInteractionType.Ping) return Effect.succeed(pongResponse());
      return dispatchApplicationCommand({
        interaction,
        services: input.services,
        applicationId: input.applicationId,
        botToken: input.botToken,
        apiBaseUrl: input.apiBaseUrl,
        internalSecret: input.internalSecret,
        waitUntil: input.waitUntil,
      });
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
