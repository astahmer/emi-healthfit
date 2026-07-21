import type { ApplicationCommandInteraction, DiscordHttpResponse } from "@emi/transport-discord";
import { ephemeralMessageResponse } from "@emi/transport-discord";
import { handleHealthfitCommand } from "./healthfit.ts";

export const dispatchApplicationCommand = (
  interaction: ApplicationCommandInteraction,
): DiscordHttpResponse => {
  if (interaction.data.name === "healthfit") return handleHealthfitCommand(interaction);
  return ephemeralMessageResponse(`Unsupported command: ${interaction.data.name}`);
};
