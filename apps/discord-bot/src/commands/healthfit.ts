import type {
  ApplicationCommandInteraction,
  DiscordHttpResponse,
} from "@emi/core/discord";
import * as Effect from "effect/Effect";
import {
  checkDiscordRateLimit,
  discordUserIdOf,
  ephemeralContent,
  optionString,
  type HealthfitCommandServices,
} from "./limits.ts";

const topLevelSubcommand = (interaction: ApplicationCommandInteraction): string | undefined =>
  interaction.data.options?.[0]?.name;

const requireLinkedUserId = (
  services: HealthfitCommandServices,
  discordUserId: string,
): Effect.Effect<string | DiscordHttpResponse> =>
  Effect.gen(function* () {
    const userId = yield* services.getLinkedUserId(discordUserId);
    if (userId === null) {
      return ephemeralContent(
        "Your Discord account isn't linked to Emi HealthFit yet. Generate a code in Settings, then run `/healthfit link code:<code>`.",
      );
    }
    return userId;
  });

export const handleHealthfitCommand = (
  interaction: ApplicationCommandInteraction,
  services: HealthfitCommandServices,
): Effect.Effect<DiscordHttpResponse> =>
  Effect.gen(function* () {
    const discordUserId = discordUserIdOf(interaction);
    if (discordUserId === undefined) {
      return ephemeralContent("Could not determine the Discord user for this interaction.");
    }
    if (!checkDiscordRateLimit(discordUserId)) {
      return ephemeralContent("Rate limit exceeded. Try again in a minute.");
    }

    const subcommand = topLevelSubcommand(interaction);
    switch (subcommand) {
      case "link": {
        const code = optionString(interaction, "code");
        if (code === undefined || code.trim() === "") {
          return ephemeralContent("Provide a code from Settings: `/healthfit link code:<code>`.");
        }
        const result = yield* services.consumeLinkCode({ code, discordUserId });
        if (!result.ok) {
          if (result.reason === "expired")
            return ephemeralContent("That link code has expired. Generate a new one in Settings.");
          if (result.reason === "consumed")
            return ephemeralContent(
              "That link code was already used. Generate a new one in Settings.",
            );
          return ephemeralContent("That link code is invalid. Generate a new one in Settings.");
        }
        return ephemeralContent(
          "Linked. You can now use `/healthfit summary`, `last-workout`, and `recovery`.",
        );
      }
      case "unlink": {
        const removed = yield* services.unlinkDiscordUser(discordUserId);
        return ephemeralContent(
          removed
            ? "Unlinked. HealthFit data commands will stop working until you link again."
            : "No linked Discord account to unlink.",
        );
      }
      case "summary":
      case "last-workout":
      case "recovery": {
        const linked = yield* requireLinkedUserId(services, discordUserId);
        if (typeof linked !== "string") return linked;
        if (subcommand === "summary")
          return ephemeralContent(yield* services.formatSummary(linked));
        if (subcommand === "last-workout")
          return ephemeralContent(yield* services.formatLastWorkout(linked));
        return ephemeralContent(yield* services.formatRecovery(linked));
      }
      default:
        return ephemeralContent("Unknown /healthfit subcommand.");
    }
  });
