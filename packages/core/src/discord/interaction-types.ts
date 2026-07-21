import { Schema } from "effect";

export const DiscordInteractionType = {
  Ping: 1,
  ApplicationCommand: 2,
  MessageComponent: 3,
  ApplicationCommandAutocomplete: 4,
  ModalSubmit: 5,
} as const;

export const DiscordInteractionResponseType = {
  Pong: 1,
  ChannelMessageWithSource: 4,
  DeferredChannelMessageWithSource: 5,
  DeferredUpdateMessage: 6,
  UpdateMessage: 7,
} as const;

export const DISCORD_EPHEMERAL_FLAG = 64;

const CommandOptionValue = Schema.Struct({
  name: Schema.String,
  // Discord value option types start at STRING=3; 1/2 are subcommands.
  type: Schema.Number.check(Schema.isGreaterThanOrEqualTo(3)),
  value: Schema.optional(Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
});

/** Discord SUB_COMMAND (1) / SUB_COMMAND_GROUP (2). */
const SubcommandOption = Schema.Struct({
  name: Schema.String,
  type: Schema.Literals([1, 2]),
  options: Schema.optional(Schema.Array(CommandOptionValue)),
});

export const ApplicationCommandData = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  options: Schema.optional(Schema.Array(Schema.Union([CommandOptionValue, SubcommandOption]))),
});
export type ApplicationCommandData = typeof ApplicationCommandData.Type;

const DiscordUser = Schema.Struct({
  id: Schema.String,
  username: Schema.optional(Schema.String),
});

const DiscordMember = Schema.Struct({
  user: Schema.optional(DiscordUser),
});

export const PingInteraction = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal(DiscordInteractionType.Ping),
});
export type PingInteraction = typeof PingInteraction.Type;

export const ApplicationCommandInteraction = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal(DiscordInteractionType.ApplicationCommand),
  token: Schema.String,
  data: ApplicationCommandData,
  member: Schema.optional(DiscordMember),
  user: Schema.optional(DiscordUser),
});
export type ApplicationCommandInteraction = typeof ApplicationCommandInteraction.Type;

/**
 * Only `Ping` and `ApplicationCommand` are registered for the MVP. Any other interaction type
 * (message component, autocomplete, modal submit) or malformed payload deliberately fails to
 * decode rather than being coerced into a loosely-typed catch-all, so callers get a clear
 * `MalformedInteraction` error instead of a value with unpredictable shape.
 */
export const DiscordInteraction = Schema.Union([PingInteraction, ApplicationCommandInteraction]);
export type DiscordInteraction = typeof DiscordInteraction.Type;

export const decodeDiscordInteraction = Schema.decodeUnknownEffect(DiscordInteraction);
