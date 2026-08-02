import * as Effect from "effect/Effect";
import { Discord } from "@emi/core/discord";
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
  return yield* Discord.requests.verify(input).pipe(
    Effect.flatMap((interaction): Effect.Effect<Discord.HttpResponse> => {
      if (interaction.type === Discord.interactions.type.Ping) {
        return Effect.succeed(Discord.responses.pong());
      }
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
        Effect.succeed(Discord.responses.unauthorized("missing signature headers")),
      InvalidSignature: () =>
        Effect.succeed(Discord.responses.unauthorized("invalid request signature")),
      StaleTimestamp: () =>
        Effect.succeed(Discord.responses.unauthorized("stale request timestamp")),
      MalformedInteraction: (error) => Effect.succeed(Discord.responses.badRequest(error.message)),
    }),
  );
});
