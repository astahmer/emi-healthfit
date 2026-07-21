import { DISCORD_EPHEMERAL_FLAG, DiscordInteractionResponseType } from "./interaction-types.ts";

/** Framework-agnostic Discord interaction response — the host app maps this onto its HTTP layer. */
export interface DiscordHttpResponse {
  readonly status: number;
  readonly body: unknown;
}

export const pongResponse = (): DiscordHttpResponse => ({
  status: 200,
  body: { type: DiscordInteractionResponseType.Pong },
});

/** Health data is sensitive by default, so every MVP command response is ephemeral. */
export const ephemeralMessageResponse = (content: string): DiscordHttpResponse => ({
  status: 200,
  body: {
    type: DiscordInteractionResponseType.ChannelMessageWithSource,
    data: { content, flags: DISCORD_EPHEMERAL_FLAG },
  },
});

/** Acknowledge within Discord's 3s window; edit/follow up later via webhook. */
export const deferredEphemeralResponse = (): DiscordHttpResponse => ({
  status: 200,
  body: {
    type: DiscordInteractionResponseType.DeferredChannelMessageWithSource,
    data: { flags: DISCORD_EPHEMERAL_FLAG },
  },
});

export const unauthorizedResponse = (message: string): DiscordHttpResponse => ({
  status: 401,
  body: { error: message },
});

export const badRequestResponse = (message: string): DiscordHttpResponse => ({
  status: 400,
  body: { error: message },
});
