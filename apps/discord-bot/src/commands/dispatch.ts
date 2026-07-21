import type { ApplicationCommandInteraction, DiscordHttpResponse } from "@emi/core/discord";
import { ephemeralMessageResponse } from "@emi/core/discord";
import * as Effect from "effect/Effect";
import { handleHealthfitCommand } from "./healthfit.ts";
import type { HealthfitCommandServices } from "./limits.ts";

export const dispatchApplicationCommand = (
  interaction: ApplicationCommandInteraction,
  services: HealthfitCommandServices,
): Effect.Effect<DiscordHttpResponse> => {
  if (interaction.data.name === "healthfit") return handleHealthfitCommand(interaction, services);
  return Effect.succeed(ephemeralMessageResponse(`Unsupported command: ${interaction.data.name}`));
};
