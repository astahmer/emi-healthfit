import { Discord } from "@emi/core/discord";
import type * as Effect from "effect/Effect";

export const DISCORD_MAX_CONTENT_LENGTH = 2000;
export const DISCORD_RATE_LIMIT_WINDOW_MS = 60_000;
export const DISCORD_RATE_LIMIT_MAX = 20;

/**
 * Soft per-isolate rate limit. Cloudflare Workers do not share this Map across
 * isolates, so it is best-effort anti-spam only — not a hard global quota.
 */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export const checkDiscordRateLimit = (discordUserId: string, now = Date.now()): boolean => {
  const existing = rateBuckets.get(discordUserId);
  if (existing === undefined || existing.resetAt <= now) {
    rateBuckets.set(discordUserId, { count: 1, resetAt: now + DISCORD_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (existing.count >= DISCORD_RATE_LIMIT_MAX) return false;
  existing.count += 1;
  return true;
};

export const resetDiscordRateLimitsForTests = () => {
  rateBuckets.clear();
};

export const truncateDiscordContent = (content: string): string => {
  if (content.length <= DISCORD_MAX_CONTENT_LENGTH) return content;
  return `${content.slice(0, DISCORD_MAX_CONTENT_LENGTH - 1)}…`;
};

export const ephemeralContent = (content: string): Discord.HttpResponse =>
  Discord.responses.ephemeralMessage(truncateDiscordContent(content));

export type ConsumeLinkResult =
  | { readonly ok: true; readonly userId: string }
  | { readonly ok: false; readonly reason: "invalid" | "expired" | "consumed" };

export interface HealthfitCommandServices {
  readonly getLinkedUserId: (discordUserId: string) => Effect.Effect<string | null>;
  readonly consumeLinkCode: (options: {
    code: string;
    discordUserId: string;
  }) => Effect.Effect<ConsumeLinkResult>;
  readonly unlinkDiscordUser: (discordUserId: string) => Effect.Effect<boolean>;
  readonly formatSummary: (userId: string) => Effect.Effect<string>;
  readonly formatLastWorkout: (userId: string) => Effect.Effect<string>;
  readonly formatRecovery: (userId: string) => Effect.Effect<string>;
}

export const discordUserIdOf = (
  interaction: Discord.ApplicationCommandInteraction,
): string | undefined =>
  interaction.user?.id ?? interaction.member?.user?.id;

export const optionString = (
  interaction: Discord.ApplicationCommandInteraction,
  optionName: string,
): string | undefined => {
  const subcommand = interaction.data.options?.[0];
  if (subcommand === undefined || !("options" in subcommand)) {
    return undefined;
  }
  const option = subcommand.options?.find((entry) => entry.name === optionName);
  return typeof option?.value === "string" ? option.value : undefined;
};
