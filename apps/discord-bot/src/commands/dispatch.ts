import { Discord } from "@emi/core/discord";
import * as Effect from "effect/Effect";
import { handleAskCommand } from "./ask.ts";
import { handleHealthfitCommand } from "./healthfit.ts";
import type { HealthfitCommandServices } from "./limits.ts";

export interface DispatchApplicationCommandInput {
  readonly interaction: Discord.ApplicationCommandInteraction;
  readonly services: HealthfitCommandServices;
  readonly applicationId: string;
  readonly botToken: string;
  readonly apiBaseUrl: string;
  readonly internalSecret: string;
  readonly waitUntil: (promise: Promise<unknown>) => void;
}

export const dispatchApplicationCommand = (
  input: DispatchApplicationCommandInput,
): Effect.Effect<Discord.HttpResponse> => {
  if (input.interaction.data.name === "healthfit") {
    return handleHealthfitCommand(input.interaction, input.services);
  }
  if (input.interaction.data.name === "ask") {
    return Effect.succeed(
      handleAskCommand({
        interaction: input.interaction,
        services: input.services,
        applicationId: input.applicationId,
        botToken: input.botToken,
        apiBaseUrl: input.apiBaseUrl,
        internalSecret: input.internalSecret,
        waitUntil: input.waitUntil,
      }),
    );
  }
  return Effect.succeed(
    Discord.responses.ephemeralMessage(`Unsupported command: ${input.interaction.data.name}`),
  );
};
