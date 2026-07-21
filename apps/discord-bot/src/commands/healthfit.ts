import type { ApplicationCommandInteraction, DiscordHttpResponse } from "@emi/transport-discord";
import { ephemeralMessageResponse } from "@emi/transport-discord";

/**
 * Account linking (Settings-issued one-time codes, `discord_account_links` /
 * `discord_link_codes` tables) has not shipped yet. Every data command must fail closed rather
 * than guess an owner id, so each subcommand below returns a fixed "not linked" message instead
 * of touching any database. Wiring a real link lookup here is the follow-up to this MVP.
 */
const NOT_LINKED_MESSAGE =
  "Your Discord account isn't linked to Emi HealthFit yet. Account linking isn't available in this build — check back once Settings supports it.";

const topLevelSubcommand = (interaction: ApplicationCommandInteraction): string | undefined =>
  interaction.data.options?.[0]?.name;

export const handleHealthfitCommand = (
  interaction: ApplicationCommandInteraction,
): DiscordHttpResponse => {
  const subcommand = topLevelSubcommand(interaction);
  switch (subcommand) {
    case "summary":
    case "last-workout":
    case "recovery":
      return ephemeralMessageResponse(NOT_LINKED_MESSAGE);
    case "unlink":
      return ephemeralMessageResponse("No linked Discord account to unlink.");
    case "link":
      return ephemeralMessageResponse(
        "Linking codes are generated from Settings, which isn't available yet. Try again once account linking ships.",
      );
    default:
      return ephemeralMessageResponse("Unknown /healthfit subcommand.");
  }
};
